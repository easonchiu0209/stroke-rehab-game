// 獎勵回流 hub（規劃書 §4.3A 變動獎勵）— 伺服器端。
//
// 每場單場遊戲結算掉落養成資源，把留存黏性導回農場/水族箱兩個 hub：
//   保底：農場金幣 3–6（依命中率加成）
//   機率 20%：珍珠 1–2
//   稀有  8%：大禮包（金幣 +15、珍珠 +3）
// 經濟校準：採收一格 3–9 金幣、常見魚 1–2 珍珠 → 一場遊戲 ≈ 1–2 次採收，不通膨。
// farm / aquarium 的養成 session 走各自 API，不經過這裡，不會重複掉落。

import { supabaseAdmin } from '@/lib/supabase'
import { DEFAULT_UNLOCKED as FARM_DEFAULT_UNLOCKED } from '@/lib/farm'
import { DEFAULT_UNLOCKED as AQ_DEFAULT_UNLOCKED } from '@/lib/aquarium'

export interface HubDrop {
  coins: number
  pearls: number
  rare: boolean
}

/** 計算掉落（純函式，方便測試） */
export function rollDrop(accuracy: number, rng: () => number = Math.random): HubDrop {
  let coins = 3 + (accuracy >= 80 ? 3 : accuracy >= 60 ? 1 : 0)
  let pearls = 0
  let rare = false
  const roll = rng()
  if (roll < 0.08) {
    rare = true
    coins += 15
    pearls += 3
  } else if (roll < 0.28) {
    pearls += rng() < 0.5 ? 1 : 2
  }
  return { coins, pearls, rare }
}

/** 資源入帳（回流 hub 與每日任務共用）：hub 列不存在就用預設值建立 */
export async function grantResources(userId: string, coins: number, pearls: number): Promise<void> {
  if (coins > 0) {
    const { data: farm } = await supabaseAdmin
      .from('farm').select('coins').eq('user_id', userId).maybeSingle()
    if (farm) {
      await supabaseAdmin.from('farm')
        .update({ coins: farm.coins + coins, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
    } else {
      await supabaseAdmin.from('farm').insert({
        user_id: userId, level: 1, coins: 30 + coins, plot_count: 9,
        unlocked: FARM_DEFAULT_UNLOCKED, total_harvest: 0,
      })
    }
  }
  if (pearls > 0) {
    const { data: aq } = await supabaseAdmin
      .from('aquarium').select('pearls').eq('user_id', userId).maybeSingle()
    if (aq) {
      await supabaseAdmin.from('aquarium')
        .update({ pearls: aq.pearls + pearls, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
    } else {
      await supabaseAdmin.from('aquarium').insert({
        user_id: userId, pearls: 20 + pearls, level: 1,
        total_caught: 0, capacity: 8,
        unlocked: AQ_DEFAULT_UNLOCKED, discovered: [],
      })
    }
  }
}

/** 遊戲結算掉落入帳 */
export async function grantHubDrop(userId: string, accuracy: number): Promise<HubDrop | null> {
  try {
    const drop = rollDrop(accuracy)
    await grantResources(userId, drop.coins, drop.pearls)
    return drop
  } catch (e) {
    console.error('grantHubDrop failed:', e)
    return null
  }
}
