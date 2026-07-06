import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { SPECIES } from '@/lib/farm'
import { FISHES } from '@/lib/aquarium'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 稀有解鎖券：用「訓練積分」直接解鎖高階物種（平常要存金幣/珍珠慢慢買）。
// 定價 = 遊戲幣解鎖價 × 1.5（積分較易賺，稍貴保持金幣路徑的價值）。
// 平台獎勵經濟決策（2026-07-06）：積分兌換以平台內虛擬獎勵為主。

interface CatalogItem {
  kind: 'farm' | 'fish'
  id: string
  name: string
  emoji: string
  points: number
}

const FARM_IDS = ['grape', 'apple', 'watermelon', 'pineapple', 'turkey', 'horse']
const FISH_IDS = ['dolphin', 'shark', 'crocodile', 'whale']

function buildCatalog(): CatalogItem[] {
  const farm = FARM_IDS.map(id => {
    const s = SPECIES[id as keyof typeof SPECIES]
    return s && { kind: 'farm' as const, id, name: s.name, emoji: s.stages[s.stages.length - 1], points: Math.ceil(s.unlockCost * 1.5) }
  })
  const fish = FISH_IDS.map(id => {
    const f = FISHES[id as keyof typeof FISHES]
    return f && { kind: 'fish' as const, id, name: f.name, emoji: f.emoji, points: Math.ceil(f.unlockCost * 1.5) }
  })
  return [...farm, ...fish].filter(Boolean) as CatalogItem[]
}

async function getOwned(userId: string) {
  const [{ data: farm }, { data: aq }] = await Promise.all([
    supabaseAdmin.from('farm').select('unlocked').eq('user_id', userId).maybeSingle(),
    supabaseAdmin.from('aquarium').select('unlocked').eq('user_id', userId).maybeSingle(),
  ])
  return {
    farm: new Set<string>((farm?.unlocked as string[]) ?? []),
    fish: new Set<string>((aq?.unlocked as string[]) ?? []),
    hasFarm: !!farm,
    hasAquarium: !!aq,
  }
}

// 目錄 + 已擁有狀態
export async function GET() {
  const session = await getServerSession(authOptions)
  const catalog = buildCatalog()
  if (!session?.user?.id) {
    return NextResponse.json({ items: catalog.map(c => ({ ...c, owned: false })) })
  }
  const owned = await getOwned(session.user.id)
  return NextResponse.json({
    items: catalog.map(c => ({
      ...c,
      owned: c.kind === 'farm' ? owned.farm.has(c.id) : owned.fish.has(c.id),
    })),
  })
}

// 用積分解鎖
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json()
  const item = buildCatalog().find(c => c.kind === body.kind && c.id === body.id)
  if (!item) return NextResponse.json({ error: '無此獎勵' }, { status: 400 })

  const owned = await getOwned(userId)
  const already = item.kind === 'farm' ? owned.farm.has(item.id) : owned.fish.has(item.id)
  if (already) return NextResponse.json({ error: '已經解鎖過了' }, { status: 400 })

  const { data: user } = await supabaseAdmin.from('users').select('total_points').eq('id', userId).single()
  if (!user || user.total_points < item.points) {
    return NextResponse.json({ error: `積分不足（需要 ${item.points}）` }, { status: 400 })
  }

  // 扣積分 → 寫入 unlocked（hub 列不存在時，玩過任一遊戲就會有；保險起見仍處理缺列）
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
