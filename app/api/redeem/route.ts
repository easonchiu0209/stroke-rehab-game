import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const { prize_id } = await req.json()

  // Get prize info
  const { data: prize } = await supabaseAdmin
    .from('prizes')
    .select('*')
    .eq('id', prize_id)
    .eq('is_active', true)
    .single()

  if (!prize) return NextResponse.json({ error: '獎品不存在' }, { status: 404 })

  // Check user points
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('total_points')
    .eq('id', session.user.id)
    .single()

  if (!user || user.total_points < prize.points_cost) {
    return NextResponse.json({ error: '積分不足' }, { status: 400 })
  }

  // Check stock
  if (prize.stock !== null && prize.stock <= 0) {
    return NextResponse.json({ error: '獎品已兌換完畢' }, { status: 400 })
  }

  // Create redemption + deduct points
  await Promise.all([
    supabaseAdmin.from('redemptions').insert({
      user_id:      session.user.id,
      prize_id:     prize.id,
      points_spent: prize.points_cost,
      status:       'pending',
    }),
    supabaseAdmin.from('point_logs').insert({
      user_id:     session.user.id,
      amount:      -prize.points_cost,
      source:      'redeem',
      description: `兌換：${prize.name}`,
    }),
    supabaseAdmin.rpc('increment_points', { uid: session.user.id, delta: -prize.points_cost }),
    prize.stock !== null
      ? supabaseAdmin.from('prizes').update({ stock: prize.stock - 1 }).eq('id', prize.id)
      : Promise.resolve(),
  ])

  return NextResponse.json({ success: true })
}
