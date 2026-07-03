import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { SPECIES, expandCost, type Species } from '@/lib/farm'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json()
  const action: string = body.action

  const { data: farm } = await supabaseAdmin.from('farm').select('*').eq('user_id', userId).single()
  if (!farm) return NextResponse.json({ error: 'no farm' }, { status: 400 })

  // ── 解鎖新物種 ──────────────────────────────────────────────
  if (action === 'unlock') {
    const sp = body.species as Species
    const def = SPECIES[sp]
    if (!def) return NextResponse.json({ error: 'bad species' }, { status: 400 })
    if (farm.unlocked.includes(sp)) return NextResponse.json({ error: '已解鎖' }, { status: 400 })
    if (farm.coins < def.unlockCost) return NextResponse.json({ error: '金幣不足' }, { status: 400 })
    await supabaseAdmin.from('farm').update({
      coins: farm.coins - def.unlockCost,
      unlocked: [...farm.unlocked, sp],
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId)
    return NextResponse.json({ ok: true })
  }

  // ── 擴建田地（+3）──────────────────────────────────────────
  if (action === 'expand') {
    const cost = expandCost(farm.plot_count)
    if (farm.coins < cost) return NextResponse.json({ error: '金幣不足' }, { status: 400 })
    const newCount = farm.plot_count + 3
    const newPlots = [farm.plot_count, farm.plot_count + 1, farm.plot_count + 2].map(idx => ({
      user_id: userId, idx, kind: 'empty', species: null, stage: 0,
    }))
    await supabaseAdmin.from('farm_plots').insert(newPlots)
    await supabaseAdmin.from('farm').update({
      coins: farm.coins - cost, plot_count: newCount, updated_at: new Date().toISOString(),
    }).eq('user_id', userId)
    return NextResponse.json({ ok: true })
  }

  // ── 在空地種植（免費，需已解鎖）─────────────────────────────
  if (action === 'plant') {
    const idx = Number(body.idx)
    const sp = body.species as Species
    const def = SPECIES[sp]
    if (!def) return NextResponse.json({ error: 'bad species' }, { status: 400 })
    if (!farm.unlocked.includes(sp)) return NextResponse.json({ error: '尚未解鎖' }, { status: 400 })
    const { data: plot } = await supabaseAdmin
      .from('farm_plots').select('*').eq('user_id', userId).eq('idx', idx).single()
    if (!plot || plot.kind !== 'empty') return NextResponse.json({ error: '此地無法種植' }, { status: 400 })
    await supabaseAdmin.from('farm_plots').update({
      kind: def.kind, species: sp, stage: 0, updated_at: new Date().toISOString(),
    }).eq('user_id', userId).eq('idx', idx)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
