import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { FISHES, expandCost, type Fish } from '@/lib/aquarium'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const body = await req.json()
  const action: string = body.action

  const { data: aq } = await supabaseAdmin.from('aquarium').select('*').eq('user_id', userId).single()
  if (!aq) return NextResponse.json({ error: 'no aquarium' }, { status: 400 })

  if (action === 'unlock') {
    const sp = body.species as Fish
    const def = FISHES[sp]
    if (!def) return NextResponse.json({ error: 'bad species' }, { status: 400 })
    if (aq.unlocked.includes(sp)) return NextResponse.json({ error: '已解鎖' }, { status: 400 })
    if (aq.pearls < def.unlockCost) return NextResponse.json({ error: '珍珠不足' }, { status: 400 })
    await supabaseAdmin.from('aquarium').update({ pearls: aq.pearls - def.unlockCost, unlocked: [...aq.unlocked, sp], updated_at: new Date().toISOString() }).eq('user_id', userId)
    return NextResponse.json({ ok: true })
  }

  if (action === 'expand') {
    const cost = expandCost(aq.capacity)
    if (aq.pearls < cost) return NextResponse.json({ error: '珍珠不足' }, { status: 400 })
    await supabaseAdmin.from('aquarium').update({ pearls: aq.pearls - cost, capacity: aq.capacity + 4, updated_at: new Date().toISOString() }).eq('user_id', userId)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
