// LLM 週報引擎（AI 指引 L4-5.1/5.2）— 僅限伺服器端使用。
//
// 流程：彙整上週訓練統計 → Claude API 生成（個案版鼓勵 ≤50 字 + 治療師版摘要草稿）
//       → 禁用詞白名單檢查 → 通過才存；失敗或無 API key 時退回規則式模板（功能不斷線）。
//
// 護欄（AI 指引 §5.1 / §6）：
// - 只能鼓勵與描述數據事實；不得診斷、不得給醫療建議
// - 治療師版標示「AI 輔助生成草稿，需治療師審閱」
// - 輸出過禁用詞檢查後才落庫

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'

// ── 週統計彙整 ─────────────────────────────────────────────

export interface WeekStats {
  sessions: number
  activeDays: number
  avgAccuracy: number | null
  avgReactionMs: number | null
  gamesPlayed: string[]
  bestGame: string | null
  totalHits: number
  // 品質指標（quality_metrics 平均）
  avgPerformanceIndex: number | null
  avgRomY: number | null            // 垂直活動範圍 0–1
  avgJerk: number | null            // 抖動（越低越平滑）
  compensationCount: number         // 代償總次數
  ddaLevelChanges: number           // 升降級次數
  // 與前一週比較（null = 前週無資料）
  deltaAccuracy: number | null
  deltaRomY: number | null
  deltaSessions: number | null
}

/** 台灣時間的上週一 00:00（UTC ISO）與週界線 */
export function lastWeekWindow(now = new Date()) {
  const tw = new Date(now.getTime() + 8 * 3600_000)
  const dow = (tw.getUTCDay() + 6) % 7            // 週一=0
  const thisMonday = new Date(Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate() - dow))
  const weekEnd = new Date(thisMonday.getTime() - 8 * 3600_000)   // 本週一 00:00 台灣 → UTC
  const weekStart = new Date(weekEnd.getTime() - 7 * 86400_000)
  const prevStart = new Date(weekStart.getTime() - 7 * 86400_000)
  const weekStartDate = new Date(weekEnd.getTime() - 7 * 86400_000 + 8 * 3600_000)
    .toISOString().slice(0, 10)                    // 上週一的台灣日期（存表用）
  return { weekStart, weekEnd, prevStart, weekStartDate }
}

interface SessionRow { game_type: string; accuracy: number | null; avg_reaction_ms: number | null; hits: number; created_at: string }
interface MetricRow { performance_index: number | null; rom_y: number | null; jerk_index: number | null; shrug_count: number; trunk_lean_count: number; trunk_tilt_count: number; dda_log: { level_before?: number; level_after?: number } | null }

async function fetchWeek(userId: string, from: Date, to: Date) {
  const [{ data: sessions }, { data: metrics }] = await Promise.all([
    supabaseAdmin.from('game_sessions')
      .select('game_type, accuracy, avg_reaction_ms, hits, created_at')
      .eq('user_id', userId).gte('created_at', from.toISOString()).lt('created_at', to.toISOString()),
    supabaseAdmin.from('quality_metrics')
      .select('performance_index, rom_y, jerk_index, shrug_count, trunk_lean_count, trunk_tilt_count, dda_log')
      .eq('user_id', userId).gte('created_at', from.toISOString()).lt('created_at', to.toISOString()),
  ])
  return { sessions: (sessions ?? []) as SessionRow[], metrics: (metrics ?? []) as MetricRow[] }
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 100) / 100 : null)

export async function collectWeekStats(userId: string, now = new Date()): Promise<WeekStats | null> {
  const { weekStart, weekEnd, prevStart } = lastWeekWindow(now)
  const cur = await fetchWeek(userId, weekStart, weekEnd)
  if (!cur.sessions.length) return null
  const prev = await fetchWeek(userId, prevStart, weekStart)

  const days = new Set(cur.sessions.map(s =>
    new Date(new Date(s.created_at).getTime() + 8 * 3600_000).toISOString().slice(0, 10)))
  const byGame = new Map<string, number>()
  for (const s of cur.sessions) byGame.set(s.game_type, (byGame.get(s.game_type) ?? 0) + 1)
  const bestGame = Array.from(byGame.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const accs = cur.sessions.map(s => s.accuracy).filter((x): x is number => x != null)
  const prevAccs = prev.sessions.map(s => s.accuracy).filter((x): x is number => x != null)
  const romYs = cur.metrics.map(m => m.rom_y).filter((x): x is number => x != null)
  const prevRomYs = prev.metrics.map(m => m.rom_y).filter((x): x is number => x != null)

  const curAcc = avg(accs), prevAcc = avg(prevAccs)
  const curRom = avg(romYs), prevRom = avg(prevRomYs)

  return {
    sessions: cur.sessions.length,
    activeDays: days.size,
    avgAccuracy: curAcc,
    avgReactionMs: avg(cur.sessions.map(s => s.avg_reaction_ms).filter((x): x is number => x != null)),
    gamesPlayed: Array.from(byGame.keys()),
    bestGame,
    totalHits: cur.sessions.reduce((s, x) => s + (x.hits ?? 0), 0),
    avgPerformanceIndex: avg(cur.metrics.map(m => m.performance_index).filter((x): x is number => x != null)),
    avgRomY: curRom,
    avgJerk: avg(cur.metrics.map(m => m.jerk_index).filter((x): x is number => x != null)),
    compensationCount: cur.metrics.reduce((s, m) => s + (m.shrug_count ?? 0) + (m.trunk_lean_count ?? 0) + (m.trunk_tilt_count ?? 0), 0),
    ddaLevelChanges: cur.metrics.filter(m => m.dda_log && m.dda_log.level_before !== m.dda_log.level_after).length,
    deltaAccuracy: curAcc != null && prevAcc != null ? Math.round((curAcc - prevAcc) * 10) / 10 : null,
    deltaRomY: curRom != null && prevRom != null ? Math.round((curRom - prevRom) * 100) / 100 : null,
    deltaSessions: prev.sessions.length ? cur.sessions.length - prev.sessions.length : null,
  }
}

// ── 文字生成 ───────────────────────────────────────────────

export interface ReportTexts { patient_message: string; therapist_summary: string; generated_by: 'llm' | 'rules' }

// 禁用詞白名單移至 lib/aiGuards.ts（與即時教練共用）
import { hasBannedWords as hasBanned } from '@/lib/aiGuards'

const SYSTEM_PROMPT = `你是復能訓練平台的數據回饋助手，為中風後上肢訓練的個案與其治療師撰寫每週回顧。

嚴格規則（不可違反）：
1. 只能「描述數據事實」與「給予鼓勵」。不得診斷、不得評估病情、不得給任何醫療建議（包括就醫、用藥、調整訓練處方）。
2. 禁止使用這些詞與其同義表述：治癒、療效、診斷、保證、痊癒、根治。一律用「訓練」「表現」「紀錄」等中性詞。
3. 若數據顯示退步，以中性陳述加溫和鼓勵，不得推測原因（生病、疼痛等），可提醒「有任何不舒服請告訴你的治療師」。
4. 個案版：繁體中文口語、溫暖、50 字以內、適合長者閱讀、可用 1–2 個 emoji。
5. 治療師版：繁體中文、專業簡潔、120 字以內、只陳述數據與趨勢，結尾固定加「（AI 輔助生成草稿，請審閱後使用）」。`

async function generateWithLLM(stats: WeekStats, displayName: string): Promise<ReportTexts | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              patient_message: { type: 'string', description: '個案版鼓勵訊息，繁中，50 字以內' },
              therapist_summary: { type: 'string', description: '治療師版數據摘要，繁中，120 字以內' },
            },
            required: ['patient_message', 'therapist_summary'],
            additionalProperties: false,
          },
        },
      },
      messages: [{
        role: 'user',
        content: `個案暱稱：${displayName}\n上週訓練統計（JSON）：\n${JSON.stringify(stats)}\n\n欄位說明：sessions=訓練場次、activeDays=訓練天數、avgAccuracy=平均命中率%、avgReactionMs=平均反應毫秒、bestGame=最常玩遊戲、avgRomY=垂直伸展範圍(0-1)、avgJerk=動作抖動指數(越低越平滑)、compensationCount=代償提醒次數(聳肩/前傾/側彎)、delta*=與前一週的差(null=前週無資料)。\n請生成本週回顧。`,
      }],
    })
    if (response.stop_reason === 'refusal') return null
    const text = response.content.find(b => b.type === 'text')?.text
    if (!text) return null
    const parsed = JSON.parse(text) as { patient_message: string; therapist_summary: string }
    if (!parsed.patient_message || !parsed.therapist_summary) return null
    if (hasBanned(parsed.patient_message) || hasBanned(parsed.therapist_summary)) {
      console.warn('weeklyReport: LLM output hit banned-word filter, falling back to rules')
      return null
    }
    return { ...parsed, generated_by: 'llm' }
  } catch (e) {
    console.error('weeklyReport LLM failed:', e)
    return null
  }
}

/** 規則式模板（無 API key / LLM 失敗時的 fallback，功能不斷線） */
function generateWithRules(stats: WeekStats, displayName: string): ReportTexts {
  const trend = stats.deltaAccuracy == null ? ''
    : stats.deltaAccuracy > 2 ? `，命中率比上週進步 ${stats.deltaAccuracy}%！`
    : stats.deltaAccuracy < -2 ? '，這週狀態普通也沒關係，持續就是進步' : '，表現很穩定'
  const patient = `${displayName}，上週完成 ${stats.sessions} 場訓練、練了 ${stats.activeDays} 天${trend} 繼續加油！💪`
  const parts = [
    `上週 ${stats.sessions} 場 / ${stats.activeDays} 天`,
    stats.avgAccuracy != null ? `平均命中率 ${stats.avgAccuracy}%${stats.deltaAccuracy != null ? `（週變化 ${stats.deltaAccuracy > 0 ? '+' : ''}${stats.deltaAccuracy}%）` : ''}` : null,
    stats.avgReactionMs != null ? `平均反應 ${stats.avgReactionMs}ms` : null,
    stats.avgRomY != null ? `垂直伸展範圍 ${stats.avgRomY}${stats.deltaRomY != null ? `（${stats.deltaRomY > 0 ? '+' : ''}${stats.deltaRomY}）` : ''}` : null,
    `代償提醒 ${stats.compensationCount} 次`,
    stats.ddaLevelChanges > 0 ? `難度調整 ${stats.ddaLevelChanges} 次` : null,
  ].filter(Boolean)
  return {
    patient_message: patient.slice(0, 80),
    therapist_summary: `${parts.join('；')}。（規則式自動生成，請審閱後使用）`,
    generated_by: 'rules',
  }
}

// ── 主流程：跑全部活躍個案 ─────────────────────────────────

export async function runWeeklyReports(now = new Date()) {
  const { weekStart, weekEnd, weekStartDate } = lastWeekWindow(now)

  // 上週有訓練紀錄的使用者
  const { data: active } = await supabaseAdmin
    .from('game_sessions')
    .select('user_id')
    .gte('created_at', weekStart.toISOString())
    .lt('created_at', weekEnd.toISOString())
  const userIds = Array.from(new Set((active ?? []).map(r => r.user_id as string)))

  let generated = 0, skipped = 0, pushed = 0
  for (const userId of userIds) {
    // 冪等：已生成過就跳過
    const { data: existing, error: exErr } = await supabaseAdmin
      .from('weekly_reports').select('id')
      .eq('user_id', userId).eq('week_start', weekStartDate).maybeSingle()
    if (exErr) { console.error('weeklyReport existing check failed:', exErr); skipped++; continue }
    if (existing) { skipped++; continue }

    const stats = await collectWeekStats(userId, now)
    if (!stats) { skipped++; continue }

    const { data: user } = await supabaseAdmin
      .from('users').select('display_name, nickname, line_id').eq('id', userId).single()
    const name = user?.nickname || user?.display_name || '你'

    const texts = (await generateWithLLM(stats, name)) ?? generateWithRules(stats, name)

    let delivered = false
    // LINE 推播（設定 LINE_MESSAGING_ACCESS_TOKEN 後自動啟用；OA channel 需與 Login 同 provider）
    if (process.env.LINE_MESSAGING_ACCESS_TOKEN && user?.line_id) {
      try {
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.LINE_MESSAGING_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            to: user.line_id,
            messages: [{ type: 'text', text: `📊 本週訓練回顧\n\n${texts.patient_message}\n\n打開遊戲看完整紀錄 → https://stroke-rehab-game.vercel.app` }],
          }),
        })
        delivered = res.ok
        if (!res.ok) console.error('LINE push failed:', res.status, await res.text().catch(() => ''))
      } catch (e) { console.error('LINE push error:', e) }
    }

    const { error: insErr } = await supabaseAdmin.from('weekly_reports').insert({
      user_id: userId,
      week_start: weekStartDate,
      stats,
      patient_message: texts.patient_message,
      therapist_summary: texts.therapist_summary,
      generated_by: texts.generated_by,
      delivered_line: delivered,
    })
    if (insErr) { console.error('weeklyReport insert failed:', insErr); skipped++; continue }
    generated++
    if (delivered) pushed++
  }
  return { week_start: weekStartDate, users: userIds.length, generated, skipped, pushed }
}
