import { supabaseAdmin } from './supabase'

// 每日/連續天數額外獎勵。所有遊戲存完 game_session 後呼叫（含農場/水族箱）。
// 以台灣時區界定「一天」。

const TZ = 'Asia/Taipei'
const TZ_MS = 8 * 3600 * 1000 // 台灣 UTC+8
const dayStr = (d: number | string) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ })

export async function awardDailyBonuses(userId: string): Promise<{ bonus: number; parts: string[]; streak: number }> {
  const since = new Date(Date.now() - 45 * 864e5).toISOString()
  const { data } = await supabaseAdmin
    .from('game_sessions').select('created_at').eq('user_id', userId).gte('created_at', since)
  const rows = data ?? []

  const today = dayStr(Date.now())
  const todayCount = rows.filter(r => dayStr(r.created_at) === today).length

  // 連續天數（含今天，往回數）
  const set = new Set(rows.map(r => dayStr(r.created_at)))
  let streak = 0, cur = Date.now()
  while (set.has(dayStr(cur))) { streak++; cur -= 864e5 }

  let bonus = 0
  const parts: string[] = []
  if (todayCount === 1) {
    bonus += 20; parts.push('每日首次訓練 +20')
    const sb = Math.min(streak, 10) * 5
    if (sb > 0) { bonus += sb; parts.push(`連續 ${streak} 天 +${sb}`) }
  }
  if (todayCount === 10) { bonus += 30; parts.push('每日第 10 次訓練 +30') }

  if (bonus > 0) {
    await supabaseAdmin.from('point_logs').insert({ user_id: userId, amount: bonus, source: 'bonus', description: parts.join('、') })
    await supabaseAdmin.rpc('increment_points', { uid: userId, delta: bonus })
  }
  return { bonus, parts, streak }
}

// 每週一 00:00 結算：發獎給「上週」週榜前三名（單次、可重複呼叫不重發）
export const WEEK_REWARDS = [100, 60, 30]

function weekBounds() {
  const d = new Date(Date.now() + TZ_MS)
  const daysSinceMon = (d.getUTCDay() + 6) % 7
  const weekStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMon) - TZ_MS
  const lastWeekStart = weekStart - 7 * 864e5
  return { weekStart, lastWeekStart }
}

export async function settleWeeklyRewards() {
  const { weekStart, lastWeekStart } = weekBounds()
  const weekKey = new Date(lastWeekStart + TZ_MS).toISOString().slice(0, 10) // 上週週一(台灣)日期

  // 已結算過就跳過
  const { data: existing } = await supabaseAdmin.from('weekly_winners').select('rank').eq('week_start', weekKey).limit(1)
  if (existing && existing.length) return { settled: false, week: weekKey, reason: 'already' }

  // 計算上週「賺得」積分前三（排除週獎本身）
  const { data: logs } = await supabaseAdmin.from('point_logs')
    .select('user_id, amount, source, created_at')
    .gte('created_at', new Date(lastWeekStart).toISOString())
    .lt('created_at', new Date(weekStart).toISOString())
  const sum = new Map<string, number>()
  for (const l of logs ?? []) {
    if (l.amount > 0 && l.source !== 'weekly_reward') sum.set(l.user_id, (sum.get(l.user_id) ?? 0) + l.amount)
  }
  const top = Array.from(sum.entries()).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (!top.length) return { settled: false, week: weekKey, reason: 'no players' }

  const rows = top.map(([user_id, pts], i) => ({ week_start: weekKey, rank: i + 1, user_id, weekly_points: pts, reward: WEEK_REWARDS[i] }))
  // 用 PK(week_start,rank) 防重：只有真正插入成功的列才發獎（race-safe）
  const { data: inserted } = await supabaseAdmin.from('weekly_winners')
    .upsert(rows, { onConflict: 'week_start,rank', ignoreDuplicates: true }).select()
  for (const r of inserted ?? []) {
    await supabaseAdmin.from('point_logs').insert({
      user_id: r.user_id, amount: r.reward, source: 'weekly_reward',
      description: `週榜 ${weekKey} 第 ${r.rank} 名獎勵 +${r.reward}`,
    })
    await supabaseAdmin.rpc('increment_points', { uid: r.user_id, delta: r.reward })
  }
  return { settled: true, week: weekKey, winners: inserted?.length ?? 0 }
}
