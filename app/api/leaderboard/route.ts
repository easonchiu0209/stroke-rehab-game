import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { settleWeeklyRewards } from '@/lib/serverPoints'

// 即時查詢，但用「分數帳本(point_logs)」只算到最近一個更新時間點為止，
// 所以排行榜只在每天 12:00 / 00:00（台灣時間）變動；週榜每週一 00:00 結算。
export const dynamic = 'force-dynamic'
export const revalidate = 0

const TZ = 8 * 3600 * 1000 // 台灣 UTC+8
const HALF_DAY = 12 * 3600 * 1000

function boundaries() {
  const d = new Date(Date.now() + TZ) // 用 UTC getters 讀到台灣牆上時間
  const bucketHour = d.getUTCHours() < 12 ? 0 : 12
  const lastBoundary = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), bucketHour) - TZ
  const nextBoundary = lastBoundary + HALF_DAY
  const daysSinceMon = (d.getUTCDay() + 6) % 7 // 週一=0
  const weekStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMon) - TZ
  const lastWeekStart = weekStart - 7 * 86400000
  return { lastBoundary, nextBoundary, weekStart, lastWeekStart }
}

export async function GET() {
  // 週一過後第一個訪客觸發上週結算發獎（idempotent）
  await settleWeeklyRewards().catch(() => {})

  const { lastBoundary, nextBoundary, weekStart } = boundaries()
  const boundaryISO = new Date(lastBoundary).toISOString()
  const lastWeekKey = new Date(weekStart - 7 * 86400000 + TZ).toISOString().slice(0, 10)

  const { data: users } = await supabaseAdmin
    .from('users').select('id, display_name, nickname, picture_url')
  const uMap = new Map((users ?? []).map(u => [u.id, { name: u.nickname || u.display_name, picture_url: u.picture_url }]))

  // 帳本：只取最近一個更新時間點之前的紀錄
  const { data: logs } = await supabaseAdmin
    .from('point_logs').select('user_id, amount, source, created_at').lt('created_at', boundaryISO)

  const all = new Map<string, number>()  // 總榜：淨積分
  const week = new Map<string, number>() // 週榜：本週「賺得」積分（不含週獎）
  for (const l of logs ?? []) {
    all.set(l.user_id, (all.get(l.user_id) ?? 0) + l.amount)
    if (l.amount > 0 && l.source !== 'weekly_reward' && new Date(l.created_at).getTime() >= weekStart) {
      week.set(l.user_id, (week.get(l.user_id) ?? 0) + l.amount)
    }
  }

  const build = (m: Map<string, number>, limit: number) =>
    Array.from(m.entries())
      .map(([id, pts]) => ({
        id, total_points: pts,
        display_name: uMap.get(id)?.name ?? '玩家',
        picture_url: uMap.get(id)?.picture_url ?? null,
      }))
      .filter(e => e.total_points > 0)
      .sort((a, b) => b.total_points - a.total_points)
      .slice(0, limit)

  // 上週前三（已結算的得獎者，含獎勵）
  const { data: winners } = await supabaseAdmin
    .from('weekly_winners').select('rank, user_id, weekly_points, reward').eq('week_start', lastWeekKey).order('rank')
  const lastWeekTop = (winners ?? []).map(w => ({
    id: w.user_id, rank: w.rank, total_points: w.weekly_points, reward: w.reward,
    display_name: uMap.get(w.user_id)?.name ?? '玩家',
    picture_url: uMap.get(w.user_id)?.picture_url ?? null,
  }))

  return NextResponse.json({
    updatedAt: boundaryISO,
    nextUpdate: new Date(nextBoundary).toISOString(),
    weekStart: new Date(weekStart).toISOString(),
    allTime: build(all, 50),
    weekly: build(week, 50),
    lastWeekTop,
  })
}
