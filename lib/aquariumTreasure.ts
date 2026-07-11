// 水族箱寶物（社交系統第二輪）：魚隨時間在缸底產寶物（🐚💎）。
// 懶惰累積：每次讀取時依「魚數 × 經過時間」補進度；每魚約 8 小時 1 個、缸底上限 6。
// 主人收集 = 寶物換珍珠 1:1；訪客撿寶走豐饒模式（不扣主人的，每訪客每日 2 個）。
// aquarium.treasures / last_drop_at 欄位未建（SQL 待套用）時全部優雅降級。

import { supabaseAdmin } from '@/lib/supabase'

export const TREASURE_CAP = 6
export const HOURS_PER_TREASURE = 8
export const VISITOR_PICKUP_CAP = 2   // 每訪客每日

/** 補進度並回傳目前缸底寶物數（欄位未建回 null） */
export async function accrueTreasures(userId: string, fishCount: number): Promise<number | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('aquarium').select('treasures, last_drop_at').eq('user_id', userId).maybeSingle()
    if (error || !data) return null
    const cur: number = data.treasures ?? 0
    if (fishCount <= 0) return cur
    const last = data.last_drop_at ? new Date(data.last_drop_at).getTime() : Date.now()
    const gained = Math.floor(((Date.now() - last) / 3600_000) * fishCount / HOURS_PER_TREASURE)
    if (gained <= 0) return cur
    const next = Math.min(TREASURE_CAP, cur + gained)
    await supabaseAdmin.from('aquarium')
      .update({ treasures: next, last_drop_at: new Date().toISOString() })
      .eq('user_id', userId)
    return next
  } catch { return null }
}

/** 主人收集：寶物 → 珍珠 1:1，缸底清空 */
export async function collectTreasures(userId: string): Promise<{ collected: number; pearls: number } | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('aquarium').select('treasures, pearls').eq('user_id', userId).maybeSingle()
    if (error || !data || (data.treasures ?? 0) <= 0) return null
    const collected: number = data.treasures
    const pearls = data.pearls + collected
    await supabaseAdmin.from('aquarium')
      .update({ treasures: 0, pearls, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    return { collected, pearls }
  } catch { return null }
}
