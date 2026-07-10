import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { SPECIES } from '@/lib/farm'
import { FISHES } from '@/lib/aquarium'
import { grantResources } from '@/lib/serverDrop'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 虛擬獎勵中心（獎勵體系決策 2026-07-09：五層階梯）
// - 解鎖券（收集層）：積分直接解鎖高階農場/水族物種
// - 驚喜蛋（即時爽感層，20 分可重複）：隨機金幣/珍珠/5–10% 限定裝飾
// - 稱號/頭像框（榮譽層）：掛在社群與排行榜名旁
// 榮譽層欄位未建（supabase-rewards2.sql 待套用）時：目錄照列、兌換回明確錯誤。

interface CatalogItem {
  kind: 'farm' | 'fish' | 'egg' | 'title' | 'frame'
  id: string
  name: string
  emoji: string
  points: number
  repeatable?: boolean
  desc?: string
}

const FARM_IDS = ['grape', 'apple', 'watermelon', 'pineapple', 'turkey', 'horse']
const FISH_IDS = ['dolphin', 'shark', 'crocodile', 'whale']

const TITLES: CatalogItem[] = [
  { kind: 'title', id: 'title:star',    name: '勤練之星', emoji: '⭐', points: 300, desc: '稱號會顯示在社群與排行榜你的名字旁' },
  { kind: 'title', id: 'title:veteran', name: '百場老將', emoji: '🎖️', points: 800, desc: '資深訓練者的榮譽' },
]
const FRAMES: CatalogItem[] = [
  { kind: 'frame', id: 'frame:bronze', name: '銅色頭像框', emoji: '🥉', points: 300 },
  { kind: 'frame', id: 'frame:silver', name: '銀色頭像框', emoji: '🥈', points: 600 },
  { kind: 'frame', id: 'frame:gold',   name: '金色頭像框', emoji: '🥇', points: 1000 },
]
const EGG: CatalogItem = { kind: 'egg', id: 'egg', name: '驚喜蛋', emoji: '🎲', points: 20, repeatable: true, desc: '隨機開出金幣、珍珠，或稀有限定裝飾！' }
const DECOS = [
  { id: 'deco:lantern', name: '紅燈籠', emoji: '🏮' },
  { id: 'deco:chime',   name: '風鈴',   emoji: '🎐' },
  { id: 'deco:bonsai',  name: '小盆栽', emoji: '🪴' },
]

function buildCatalog(): CatalogItem[] {
  const farm = FARM_IDS.map(id => {
    const s = SPECIES[id as keyof typeof SPECIES]
    return s && { kind: 'farm' as const, id, name: s.name, emoji: s.stages[s.stages.length - 1], points: Math.ceil(s.unlockCost * 1.5) }
  }).filter(Boolean) as CatalogItem[]
  const fish = FISH_IDS.map(id => {
    const f = FISHES[id as keyof typeof FISHES]
    return f && { kind: 'fish' as const, id, name: f.name, emoji: f.emoji, points: Math.ceil(f.unlockCost * 1.5) }
  }).filter(Boolean) as CatalogItem[]
  return [EGG, ...TITLES, ...FRAMES, ...farm, ...fish]
}

async function getOwned(userId: string) {
  const [{ data: farm }, { data: aq }] = await Promise.all([
    supabaseAdmin.from('farm').select('unlocked').eq('user_id', userId).maybeSingle(),
    supabaseAdmin.from('aquarium').select('unlocked').eq('user_id', userId).maybeSingle(),
  ])
  // 榮譽欄位獨立查詢（欄位未建時吞錯 → 視為未擁有）
  let items: string[] = []
  try {
    const { data } = await supabaseAdmin.from('users').select('owned_items').eq('id', userId).maybeSingle()
    if (Array.isArray(data?.owned_items)) items = data.owned_items as string[]
  } catch { /* 欄位未建 */ }
  return {
    farm: new Set<string>((farm?.unlocked as string[]) ?? []),
    fish: new Set<string>((aq?.unlocked as string[]) ?? []),
    items: new Set<string>(items),
    hasFarm: !!farm,
    hasAquarium: !!aq,
  }
}

function isOwned(c: CatalogItem, o: Awaited<ReturnType<typeof getOwned>>): boolean {
  if (c.repeatable) return false
  if (c.kind === 'farm') return o.farm.has(c.id)
  if (c.kind === 'fish') return o.fish.has(c.id)
  return o.items.has(c.id)
}

// 目錄 + 已擁有狀態
export async function GET() {
  const session = await getServerSession(authOptions)
  const catalog = buildCatalog()
  if (!session?.user?.id) {
    return NextResponse.json({ items: catalog.map(c => ({ ...c, owned: false })) })
  }
  const owned = await getOwned(session.user.id)
  return NextResponse.json({ items: catalog.map(c => ({ ...c, owned: isOwned(c, owned) })) })
}

// 兌換
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json()
  const item = buildCatalog().find(c => c.kind === body.kind && c.id === body.id)
  if (!item) return NextResponse.json({ error: '無此獎勵' }, { status: 400 })

  const owned = await getOwned(userId)
  if (isOwned(item, owned)) return NextResponse.json({ error: '已經擁有了' }, { status: 400 })

  const { data: user } = await supabaseAdmin.from('users').select('total_points').eq('id', userId).single()
  if (!user || user.total_points < item.points) {
    return NextResponse.json({ error: `積分不足（需要 ${item.points}）` }, { status: 400 })
  }

  // ── 驚喜蛋：先開獎再扣分入帳（一次交易語意：開獎純計算） ──
  if (item.kind === 'egg') {
    const roll = Math.random()
    let prize: { type: 'coins' | 'pearls' | 'deco'; amount?: number; deco?: typeof DECOS[number] }
    const unownedDecos = DECOS.filter(d => !owned.items.has(d.id))
    if (roll < 0.10 && unownedDecos.length) {
      prize = { type: 'deco', deco: unownedDecos[Math.floor(Math.random() * unownedDecos.length)] }
    } else if (roll < 0.40) {
      prize = { type: 'pearls', amount: 2 + Math.floor(Math.random() * 3) }
    } else {
      prize = { type: 'coins', amount: 8 + Math.floor(Math.random() * 8) }
    }

    await supabaseAdmin.rpc('increment_points', { uid: userId, delta: -item.points })
    await supabaseAdmin.from('point_logs').insert({
      user_id: userId, amount: -item.points, source: 'redeem',
      description: `🎲 驚喜蛋：${prize.type === 'deco' ? `限定裝飾 ${prize.deco!.emoji}${prize.deco!.name}` : prize.type === 'pearls' ? `珍珠 ×${prize.amount}` : `金幣 ×${prize.amount}`}`,
    })
    if (prize.type === 'coins') await grantResources(userId, prize.amount!, 0)
    else if (prize.type === 'pearls') await grantResources(userId, 0, prize.amount!)
    else {
      const { error } = await supabaseAdmin.from('users')
        .update({ owned_items: Array.from(owned.items).concat(prize.deco!.id) }).eq('id', userId)
      if (error) { // 欄位未建：退回改發金幣，不吃掉使用者的分
        await grantResources(userId, 20, 0)
        prize = { type: 'coins', amount: 20 }
      }
    }
    const { data: after } = await supabaseAdmin.from('users').select('total_points').eq('id', userId).single()
    return NextResponse.json({ ok: true, egg: prize, remainingPoints: after?.total_points ?? 0 })
  }

  // ── 稱號 / 頭像框 ──
  if (item.kind === 'title' || item.kind === 'frame') {
    const patch: Record<string, unknown> = { owned_items: Array.from(owned.items).concat(item.id) }
    if (item.kind === 'title') patch.title = item.name
    else patch.avatar_frame = item.id.replace('frame:', '')
    const { error } = await supabaseAdmin.from('users').update(patch).eq('id', userId)
    if (error) {
      console.error('badge redeem failed:', error)
      return NextResponse.json({ error: '兌換失敗（資料表尚未更新）' }, { status: 500 })
    }
    await supabaseAdmin.rpc('increment_points', { uid: userId, delta: -item.points })
    await supabaseAdmin.from('point_logs').insert({
      user_id: userId, amount: -item.points, source: 'redeem',
      description: `兌換${item.kind === 'title' ? '稱號' : '頭像框'}：${item.emoji} ${item.name}`,
    })
    const { data: after } = await supabaseAdmin.from('users').select('total_points').eq('id', userId).single()
    return NextResponse.json({ ok: true, unlocked: item, remainingPoints: after?.total_points ?? 0 })
  }

  // ── 解鎖券（原有邏輯） ──
  await supabaseAdmin.rpc('increment_points', { uid: userId, delta: -item.points })
  await supabaseAdmin.from('point_logs').insert({
    user_id: userId, amount: -item.points, source: 'redeem',
    description: `解鎖券：${item.emoji} ${item.name}`,
  })

  if (item.kind === 'farm') {
    if (!owned.hasFarm) {
      await supabaseAdmin.from('farm').insert({
        user_id: userId, level: 1, coins: 30, plot_count: 9,
        unlocked: ['carrot', 'corn', 'chicken', item.id], total_harvest: 0,
      })
    } else {
      await supabaseAdmin.from('farm')
        .update({ unlocked: Array.from(owned.farm).concat(item.id), updated_at: new Date().toISOString() })
        .eq('user_id', userId)
    }
  } else {
    if (!owned.hasAquarium) {
      await supabaseAdmin.from('aquarium').insert({
        user_id: userId, pearls: 20, level: 1, total_caught: 0, capacity: 8,
        unlocked: ['clownfish', 'goldfish', 'puffer', 'shrimp', 'crab', item.id], discovered: [],
      })
    } else {
      await supabaseAdmin.from('aquarium')
        .update({ unlocked: Array.from(owned.fish).concat(item.id), updated_at: new Date().toISOString() })
        .eq('user_id', userId)
    }
  }

  const { data: after } = await supabaseAdmin.from('users').select('total_points').eq('id', userId).single()
  return NextResponse.json({ ok: true, unlocked: item, remainingPoints: after?.total_points ?? 0 })
}
