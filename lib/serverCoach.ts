// 場末即時 AI 教練（AI 指引 §5.1）— 伺服器端，由 /api/game/save 呼叫。
// 輸入本場表現＋近期趨勢 → 50 字內繁中口語鼓勵；LLM 逾時(4s)/失敗/禁用詞 → 規則式模板。
// 護欄：只描述數據事實與鼓勵；疼痛等不適一律導向「請告訴治療師」，不由 LLM 自由發揮。

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { hasBannedWords } from '@/lib/aiGuards'
import { GAME_INFO } from '@/lib/gameInfo'

export interface CoachContext {
  userId: string
  gameType: string
  difficulty: string
  hits: number
  misses: number
  accuracy: number
  ddaChange?: -1 | 0 | 1
}

const SYSTEM_PROMPT = `你是復能訓練遊戲的加油教練，對象是中風後或骨科術後的長者。
規則（不可違反）：
1. 只能描述本場數據事實與給予鼓勵，禁止醫療建議、診斷、療效宣稱。
2. 禁用詞：治癒、療效、診斷、保證、痊癒、根治。
3. 繁體中文、口語、溫暖、40 字以內、最多 1 個 emoji。表現退步也不批評，用「持續就是進步」方向鼓勵。
4. 直接輸出那句話，不要引號、不要前後綴。`

async function llmCoach(ctx: CoachContext, name: string, trend: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  try {
    const client = new Anthropic()
    const gameName = GAME_INFO[ctx.gameType]?.name ?? ctx.gameType
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `個案：${name}。剛完成「${gameName}」（難度 ${ctx.difficulty}）：命中 ${ctx.hits}、失誤 ${ctx.misses}、命中率 ${ctx.accuracy}%。${trend}${
          ctx.ddaChange === 1 ? ' 系統剛把難度調升一級（表現穩定）。' : ctx.ddaChange === -1 ? ' 系統剛把難度調得更友善。' : ''
        }請給一句加油話。`,
      }],
    }, { timeout: 4000 })
    if (response.stop_reason === 'refusal') return null
    const text = response.content.find(b => b.type === 'text')?.text?.trim()
    if (!text || text.length > 80 || hasBannedWords(text)) return null
    return text
  } catch {
    return null   // 逾時/失敗 → 規則式
  }
}

function rulesCoach(ctx: CoachContext, trend: 'up' | 'down' | 'flat' | 'first'): string {
  if (ctx.accuracy >= 85) return '太厲害了，這場打得又快又準！🌟'
  if (trend === 'up') return '比之前進步了，身體記住這個感覺！💪'
  if (trend === 'first') return '完成第一場了，好的開始！繼續保持 😊'
  if (ctx.accuracy >= 60) return '表現很穩定，每天練一點最有用！'
  return '完成訓練就是勝利，明天再來一場！💪'
}

/** 生成場末教練訊息（永遠回傳一句話；LLM 可用時個人化，不可用時模板） */
export async function generateCoach(ctx: CoachContext): Promise<{ text: string; generated_by: 'llm' | 'rules' }> {
  // 近 5 場同遊戲平均（本場之前）→ 趨勢
  let trend: 'up' | 'down' | 'flat' | 'first' = 'first'
  let trendText = '這是他最近第一場這個遊戲。'
  let name = '你'
  try {
    const [{ data: prev }, { data: user }] = await Promise.all([
      supabaseAdmin.from('game_sessions')
        .select('accuracy')
        .eq('user_id', ctx.userId).eq('game_type', ctx.gameType)
        .order('created_at', { ascending: false }).range(1, 5),   // 跳過剛存的本場
      supabaseAdmin.from('users').select('display_name, nickname').eq('id', ctx.userId).single(),
    ])
    name = user?.nickname || user?.display_name || '你'
    const accs = (prev ?? []).map(r => r.accuracy).filter((x): x is number => x != null)
    if (accs.length) {
      const avg = accs.reduce((s, v) => s + v, 0) / accs.length
      trend = ctx.accuracy > avg + 5 ? 'up' : ctx.accuracy < avg - 5 ? 'down' : 'flat'
      trendText = `他近 ${accs.length} 場平均命中率 ${Math.round(avg)}%（本場${trend === 'up' ? '高於' : trend === 'down' ? '低於' : '接近'}平均）。`
    }
  } catch { /* 趨勢查詢失敗就用預設 */ }

  const llm = await llmCoach(ctx, name, trendText)
  if (llm) return { text: llm, generated_by: 'llm' }
  return { text: rulesCoach(ctx, trend), generated_by: 'rules' }
}
