import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { buildDailyQuests, questProgress, todayTW, dayStartUTC, type SessionLite } from '@/lib/quests'
import { grantResources } from '@/lib/serverDrop'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function loadState(userId: string) {
  const date = todayTW()
  const quests = buildDailyQuests(date)
  const [{ data: sessions }, { data: claims }] = await Promise.all([
    supabaseAdmin.from('game_sessions')
      .select('game_type, accuracy')
      .eq('user_id', userId)
      .gte('created_at', dayStartUTC().toISOString()),
    supabaseAdmin.from('quest_claims')
      .select('quest_id')
      .eq('user_id', userId).eq('quest_date', date),
  ])
  const claimed = new Set((claims ?? []).map(c => c.quest_id as string))
  return {
    date,
    quests: quests.map(q => ({
      ...q,
      progress: Math.min(q.target, questProgress(q, (sessions ?? []) as SessionLite[])),
      claimed: claimed.has(q.id),
    })),
  }
}

// 今日任務 + 進度 + 領取狀態
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ quests: null })
  return NextResponse.json(await loadState(session.user.id))
}

// 領取任務獎勵（冪等：quest_claims PK 擋重複）
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json()
  const questId = String(body.quest_id ?? '')
  const state = await loadState(userId)
  const quest = state.quests.find(q => q.id === questId)
  if (!quest) return NextResponse.json({ error: '無此任務' }, { status: 400 })
  if (quest.claimed) return NextResponse.json({ error: '已領取過' }, { status: 400 })
  if (quest.progress < quest.target) return NextResponse.json({ error: '任務還沒完成' }, { status: 400 })

  // 先插領獎紀錄（PK 冪等），成功才入帳 — 避免併發重複發獎
  const { error: claimErr } = await supabaseAdmin.from('quest_claims')
    .insert({ user_id: userId, quest_date: state.date, quest_id: questId })
  if (claimErr) {
    console.error('quest claim failed:', claimErr)
    return NextResponse.json({ error: '已領取過或系統忙碌' }, { status: 409 })
  }
  await grantResources(userId, quest.reward.coins, quest.reward.pearls)

  return NextResponse.json({ ok: true, reward: quest.reward })
}
