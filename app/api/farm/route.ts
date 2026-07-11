import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { awardDailyBonuses } from '@/lib/serverPoints'
import { saveMotionData } from '@/lib/serverMotion'
import {
  SPECIES, DEFAULT_UNLOCKED, ripeStage, isRipe, levelForHarvest, stealAmount,
  type Species, type Plot, type FarmState,
} from '@/lib/farm'

// 首次進入時的初始田地（讓第一次就有東西可收）
const SEED_PLOTS: Array<{ idx: number; kind: 'crop' | 'animal' | 'empty'; species: Species | null; stage: number }> = [
  { idx: 0, kind: 'crop',   species: 'carrot',  stage: 2 },
  { idx: 1, kind: 'crop',   species: 'carrot',  stage: 1 },
  { idx: 2, kind: 'crop',   species: 'carrot',  stage: 0 },
  { idx: 3, kind: 'crop',   species: 'corn',    stage: 2 },
  { idx: 4, kind: 'crop',   species: 'corn',    stage: 0 },
  { idx: 5, kind: 'crop',   species: 'corn',    stage: 1 },
  { idx: 6, kind: 'animal', species: 'chicken', stage: 2 },
  { idx: 7, kind: 'empty',  species: null,      stage: 0 },
  { idx: 8, kind: 'empty',  species: null,      stage: 0 },
]

async function loadFarm(userId: string): Promise<FarmState> {
  let { data: farm } = await supabaseAdmin.from('farm').select('*').eq('user_id', userId).single()

  // 首次：建立預設農場 + 初始田地
  if (!farm) {
    const { data: created } = await supabaseAdmin
      .from('farm')
      .insert({ user_id: userId, level: 1, coins: 30, plot_count: 9, unlocked: DEFAULT_UNLOCKED, total_harvest: 0 })
      .select()
      .single()
    farm = created
    await supabaseAdmin.from('farm_plots').insert(
      SEED_PLOTS.map(p => ({ user_id: userId, ...p })),
    )
  }

  const { data: plotRows } = await supabaseAdmin
    .from('farm_plots').select('*').eq('user_id', userId).order('idx')

  const plots: Plot[] = (plotRows ?? []).map(p => ({
    idx: p.idx, kind: p.kind, species: p.species, stage: p.stage, stolen: p.stolen ?? false,
  }))

  return {
    level:         farm.level,
    coins:         farm.coins,
    plot_count:    farm.plot_count,
    unlocked:      farm.unlocked,
    total_harvest: farm.total_harvest,
    plots,
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const state = await loadFarm(session.user.id)
  return NextResponse.json(state)
}

// 套用一次 AR 照顧 session 的結果
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json()
  const harvested: number[] = Array.isArray(body.harvested) ? body.harvested : []
  const pestsShooed: number = Number(body.pestsShooed) || 0
  const durationSecs: number = Number(body.duration_secs) || 60

  const state = await loadFarm(userId)
  const plotMap = new Map(state.plots.map(p => [p.idx, p]))

  let coinsEarned = 0
  let harvestCount = 0

  // 1) 採收：只採真的成熟的（被偷過的田扣掉被偷份額，保底 70%）
  for (const idx of harvested) {
    const plot = plotMap.get(idx)
    if (!plot || !plot.species || !isRipe(plot)) continue
    const reward = SPECIES[plot.species].reward
    coinsEarned += plot.stolen ? reward - stealAmount(plot.species) : reward
    harvestCount++
    if (plot.kind === 'crop') {
      plot.stage = 0            // 作物採收後重新生長
      plot.stolen = false       // 新的一輪，可再被偷
    }
    // 動物採收後維持成年（下次還能收），不動 stage
  }

  // 2) 趕走害蟲加分
  coinsEarned += pestsShooed

  // 3) 成長：所有未成熟的田地 +1 階
  const updatedPlots = Array.from(plotMap.values())
  for (const plot of updatedPlots) {
    if (plot.kind === 'empty' || !plot.species) continue
    if (plot.stage < ripeStage(plot.species)) plot.stage += 1
  }

  // 4) 寫回田地
  await supabaseAdmin.from('farm_plots').upsert(
    updatedPlots.map(p => ({
      user_id: userId, idx: p.idx, kind: p.kind, species: p.species, stage: p.stage,
      stolen: p.stolen ?? false, updated_at: new Date().toISOString(),
    })),
    { onConflict: 'user_id,idx' },
  )

  // 5) 更新農場：金幣、累計採收、等級
  const newTotalHarvest = state.total_harvest + harvestCount
  const newLevel = levelForHarvest(newTotalHarvest)
  const newCoins = state.coins + coinsEarned
  await supabaseAdmin.from('farm').update({
    coins: newCoins, total_harvest: newTotalHarvest, level: newLevel, updated_at: new Date().toISOString(),
  }).eq('user_id', userId)

  // 6) 記錄為一場遊戲（進排行榜/個人頁）並給平台積分
  const platformPoints = harvestCount * 5 + pestsShooed
  const trajectory: number[][] | null = Array.isArray(body.trajectory) ? body.trajectory : null
  const { data: saved } = await supabaseAdmin.from('game_sessions').insert({
    user_id: userId, game_type: 'farm', difficulty: 'easy',
    score: coinsEarned, hits: harvestCount, misses: 0, accuracy: 100,
    duration_secs: durationSecs, points_earned: platformPoints,
    trajectory,
  }).select().single()

  // 動作錄製 + 代償事件 + 品質指標（Phase 1 AI 基礎建設）
  if (saved?.id) await saveMotionData(userId, saved.id, body, trajectory)
  if (platformPoints > 0) {
    await supabaseAdmin.from('point_logs').insert({
      user_id: userId, amount: platformPoints, source: 'game',
      description: '復能開心農場 採收', session_id: saved?.id ?? null,
    })
    await supabaseAdmin.rpc('increment_points', { uid: userId, delta: platformPoints })
  }

  await awardDailyBonuses(userId)

  const newState = await loadFarm(userId)
  return NextResponse.json({
    state: newState,
    coinsEarned, harvestCount, levelUp: newLevel > state.level, platformPoints,
  })
}
