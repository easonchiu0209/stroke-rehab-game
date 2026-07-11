import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { awardDailyBonuses } from '@/lib/serverPoints'
import {
  FISHES, DEFAULT_UNLOCKED, MAX_STAGE, levelForCaught,
  type Fish, type AquariumState,
} from '@/lib/aquarium'
import { accrueTreasures } from '@/lib/aquariumTreasure'

async function load(userId: string): Promise<AquariumState> {
  let { data: aq } = await supabaseAdmin.from('aquarium').select('*').eq('user_id', userId).single()
  if (!aq) {
    const { data } = await supabaseAdmin.from('aquarium')
      .insert({ user_id: userId, pearls: 20, level: 1, total_caught: 0, capacity: 8, unlocked: DEFAULT_UNLOCKED, discovered: [] })
      .select().single()
    aq = data
  }
  const { data: fishRows } = await supabaseAdmin
    .from('aquarium_fish').select('id, species, stage').eq('user_id', userId).order('created_at')
  const fish = (fishRows ?? []).map(f => ({ id: f.id, species: f.species, stage: f.stage }))
  // 缸底寶物懶惰累積（欄位未建時 null → 不顯示）
  const treasures = await accrueTreasures(userId, fish.length)
  return {
    pearls: aq.pearls, level: aq.level, capacity: aq.capacity, total_caught: aq.total_caught,
    unlocked: aq.unlocked, discovered: aq.discovered ?? [],
    fish,
    treasures: treasures ?? undefined,
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await load(session.user.id))
}

// 套用一次釣魚 session：成長現有魚、結算珍珠、加入新釣到的魚
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json()
  const caught: Fish[] = Array.isArray(body.caught) ? body.caught.filter((c: string) => c in FISHES) : []
  const durationSecs = Number(body.duration_secs) || 60

  const state = await load(userId)

  // 1) 現有魚成長 +1
  const grown = state.fish.map(f => ({ ...f, stage: Math.min(MAX_STAGE, f.stage + 1) }))
  for (const f of grown) {
    if (f.stage !== state.fish.find(x => x.id === f.id)?.stage) {
      await supabaseAdmin.from('aquarium_fish').update({ stage: f.stage }).eq('id', f.id)
    }
  }

  // 2) 成年魚產珍珠
  let pearlsEarned = 0
  for (const f of grown) if (f.stage >= MAX_STAGE) pearlsEarned += FISHES[f.species].pearl

  // 3) 加入新釣到的魚（受容量限制）
  const space = Math.max(0, state.capacity - grown.length)
  const toAdd = caught.slice(0, space)
  if (toAdd.length) {
    await supabaseAdmin.from('aquarium_fish').insert(toAdd.map(sp => ({ user_id: userId, species: sp, stage: 0 })))
  }
  const overflow = caught.length - toAdd.length

  // 4) 圖鑑 + 統計 + 等級
  const discovered = Array.from(new Set([...state.discovered, ...caught]))
  const totalCaught = state.total_caught + caught.length
  const level = levelForCaught(totalCaught)
  const newPearls = state.pearls + pearlsEarned + overflow * 1   // 滿了的魚放生換 1 珍珠

  await supabaseAdmin.from('aquarium').update({
    pearls: newPearls, total_caught: totalCaught, level, discovered, updated_at: new Date().toISOString(),
  }).eq('user_id', userId)

  // 5) 記錄成一場遊戲（進個人頁/排行榜）
  const platformPoints = caught.length * 5
  const { data: saved } = await supabaseAdmin.from('game_sessions').insert({
    user_id: userId, game_type: 'aquarium', difficulty: 'easy',
    score: caught.length * 10, hits: caught.length, misses: 0, accuracy: 100,
    duration_secs: durationSecs, points_earned: platformPoints,
  }).select().single()
  if (platformPoints > 0) {
    await supabaseAdmin.from('point_logs').insert({ user_id: userId, amount: platformPoints, source: 'game', description: '復能水族箱 釣魚', session_id: saved?.id ?? null })
    await supabaseAdmin.rpc('increment_points', { uid: userId, delta: platformPoints })
  }

  await awardDailyBonuses(userId)

  return NextResponse.json({
    state: await load(userId),
    caughtCount: caught.length, added: toAdd.length, overflow, pearlsEarned,
    levelUp: level > state.level,
  })
}
