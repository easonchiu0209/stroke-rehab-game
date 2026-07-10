// 月度挑戰徽章（活動限定層）：當月訓練滿 20 天 → 限定徽章。
// 過期不補（跨月歸零）、已獲得永久保留。獎勵綁「出席」不綁表現（獎勵設計原則）。

import { supabaseAdmin } from '@/lib/supabase'
import { todayTW } from '@/lib/quests'

export const MONTHLY_TARGET = 20

/** 本月已訓練天數（台灣時間、去重） */
export async function monthDaysTrained(userId: string, now = new Date()): Promise<number> {
  const today = todayTW(now)
  const monthStartUTC = new Date(new Date(`${today.slice(0, 8)}01T00:00:00Z`).getTime() - 8 * 3600_000)
  const { data } = await supabaseAdmin
    .from('game_sessions').select('created_at')
    .eq('user_id', userId).gte('created_at', monthStartUTC.toISOString())
  const days = new Set((data ?? []).map(r =>
    new Date(new Date(r.created_at).getTime() + 8 * 3600_000).toISOString().slice(0, 10)))
  return days.size
}

/** 達標即頒發（冪等：PK 擋重複）；回傳是否「新獲得」 */
export async function checkAndAwardMonthlyBadge(userId: string, now = new Date()): Promise<boolean> {
  try {
    const days = await monthDaysTrained(userId, now)
    if (days < MONTHLY_TARGET) return false
    const month = todayTW(now).slice(0, 7)
    const { data: exists } = await supabaseAdmin
      .from('monthly_badges').select('month')
      .eq('user_id', userId).eq('month', month).maybeSingle()
    if (exists) return false
    const { error } = await supabaseAdmin.from('monthly_badges')
      .insert({ user_id: userId, month, days_trained: days })
    return !error
  } catch {
    return false   // 表未建（SQL 待套用）：優雅略過
  }
}

/** 進度與歷史徽章（首頁卡/個人頁用） */
export async function getMonthlyProgress(userId: string, now = new Date()) {
  const month = todayTW(now).slice(0, 7)
  const days = await monthDaysTrained(userId, now)
  let badges: { month: string; days_trained: number }[] = []
  try {
    const { data } = await supabaseAdmin
      .from('monthly_badges').select('month, days_trained')
      .eq('user_id', userId).order('month', { ascending: false }).limit(24)
    badges = data ?? []
  } catch { /* 表未建 */ }
  return {
    month,
    days,
    target: MONTHLY_TARGET,
    earned: badges.some(b => b.month === month),
    badges,
  }
}
