import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { SPECIES, isRipe, stealAmount, type Plot, type Species } from '@/lib/farm'
import { grantResources } from '@/lib/serverDrop'
import { todayTW } from '@/lib/quests'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 串門子＋偷菜（社交系統第一輪）
// 保護欄：只偷成熟「作物」（動物是夥伴不偷）、每塊田一輪最多被偷 1 次（採收重置）、
//         偷者每日上限 3 次、主人保底 70%（偷走 30%，主人採收時扣除）。

const DAILY_STEAL_CAP = 3

function dayStartUTC(): string {
  return new Date(new Date(`${todayTW()}T00:00:00Z`).getTime() - 8 * 3600_000).toISOString()
}

async function stealsToday(actorId: string): Promise<number> {
  try {
    const { count } = await supabaseAdmin
      .from('social_events').select('id', { count: 'exact', head: true })
      .eq('actor_id', actorId).eq('type', 'steal').gte('created_at', dayStartUTC())
    return count ?? 0
  } catch { return DAILY_STEAL_CAP }   // 表未建：視為額度用完（功能未開通）
}

// GET：無參數 → 鄰居列表；?userId= → 參觀對象的農場
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user.id
  const userId = req.nextUrl.searchParams.get('userId')

  // 我的動態（hub 頁顯示「誰來過」）
  if (req.nextUrl.searchParams.get('events') === '1') {
    try {
      const { data } = await supabaseAdmin
        .from('social_events')
        .select('type, payload, created_at, users!social_events_actor_id_fkey(display_name, nickname)')
        .eq('user_id', me).order('created_at', { ascending: false }).limit(5)
      return NextResponse.json({
        events: (data ?? []).map(e => {
          const actor = Array.isArray(e.users) ? e.users[0] : e.users
          return { type: e.type, payload: e.payload, created_at: e.created_at, actor_name: actor?.nickname || actor?.display_name || '有人' }
        }),
      })
    } catch { return NextResponse.json({ events: [] }) }
  }

  if (!userId) {
    // 鄰居列表：有農場的活躍使用者（不含自己）
    const { data: farms } = await supabaseAdmin.from('farm').select('user_id, level')
    const ids = (farms ?? []).map(f => f.user_id).filter(id => id !== me)
    if (!ids.length) return NextResponse.json({ neighbors: [] })
    const { data: users } = await supabaseAdmin
      .from('users').select('id, display_name, nickname, picture_url').in('id', ids)
    const levelBy = new Map((farms ?? []).map(f => [f.user_id, f.level]))
    return NextResponse.json({
      neighbors: (users ?? []).map(u => ({
        id: u.id,
        name: u.nickname || u.display_name || '鄰居',
        picture_url: u.picture_url,
        farm_level: levelBy.get(u.id) ?? 1,
      })),
      stealsLeft: Math.max(0, DAILY_STEAL_CAP - await stealsToday(me)),
    })
  }

  // 參觀農場
  if (userId === me) return NextResponse.json({ error: '這是你自己的農場' }, { status: 400 })
  const [{ data: owner }, { data: plotRows }] = await Promise.all([
    supabaseAdmin.from('users').select('display_name, nickname, picture_url').eq('id', userId).single(),
    supabaseAdmin.from('farm_plots').select('*').eq('user_id', userId).order('idx'),
  ])
  if (!owner || !plotRows) return NextResponse.json({ error: '找不到這位鄰居的農場' }, { status: 404 })

  // 來訪紀錄（同一天同一人只記一次，避免洗版）
  try {
    const { data: visited } = await supabaseAdmin
      .from('social_events').select('id').eq('user_id', userId).eq('actor_id', me)
      .eq('type', 'visit').gte('created_at', dayStartUTC()).limit(1).maybeSingle()
    if (!visited) await supabaseAdmin.from('social_events').insert({ user_id: userId, actor_id: me, type: 'visit' })
  } catch { /* 表未建 */ }

  return NextResponse.json({
    owner: { name: owner.nickname || owner.display_name || '鄰居', picture_url: owner.picture_url },
    plots: plotRows.map(p => ({
      idx: p.idx, kind: p.kind, species: p.species, stage: p.stage, stolen: p.stolen ?? false,
    })),
    stealsLeft: Math.max(0, DAILY_STEAL_CAP - await stealsToday(me)),
  })
}

// POST：偷菜
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user.id

  const body = await req.json()
  if (body.action !== 'steal') return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  const target = String(body.target ?? '')
  const idx = Number(body.idx)
  if (!target || target === me || !Number.isInteger(idx)) return NextResponse.json({ error: '參數錯誤' }, { status: 400 })

  if (await stealsToday(me) >= DAILY_STEAL_CAP) {
    return NextResponse.json({ error: `今天的偷菜額度用完了（每天 ${DAILY_STEAL_CAP} 次），明天再來 😄` }, { status: 400 })
  }

  const { data: plot } = await supabaseAdmin
    .from('farm_plots').select('*').eq('user_id', target).eq('idx', idx).maybeSingle()
  if (!plot || !plot.species) return NextResponse.json({ error: '這塊田是空的' }, { status: 400 })
  const p: Plot = { idx: plot.idx, kind: plot.kind, species: plot.species, stage: plot.stage, stolen: plot.stolen ?? false }
  if (p.kind !== 'crop') return NextResponse.json({ error: '動物是人家的夥伴，不能偷啦' }, { status: 400 })
  if (!isRipe(p)) return NextResponse.json({ error: '還沒成熟，偷了也不好吃' }, { status: 400 })
  if (p.stolen) return NextResponse.json({ error: '這塊田已經被偷過了' }, { status: 400 })

  // 標記被偷（原子性：條件更新，防同時偷）
  const { data: updated, error: updErr } = await supabaseAdmin
    .from('farm_plots').update({ stolen: true, updated_at: new Date().toISOString() })
    .eq('user_id', target).eq('idx', idx).eq('stolen', false)
    .select().maybeSingle()
  if (updErr || !updated) return NextResponse.json({ error: '手慢了，被別人偷走了' }, { status: 409 })

  const coins = stealAmount(p.species as Species)
  await grantResources(me, coins, 0)
  try {
    await supabaseAdmin.from('social_events').insert({
      user_id: target, actor_id: me, type: 'steal',
      payload: { idx, species: p.species, coins },
    })
  } catch { /* 表未建 */ }

  const sp = SPECIES[p.species as Species]
  return NextResponse.json({ ok: true, coins, species_name: sp.name, species_emoji: sp.stages[sp.stages.length - 1] })
}
