import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// 平台積分 → 農場金幣 / 水族箱珍珠（單向，不可換回）
// 匯率：金幣 1:1；珍珠 2:1
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json()
  const to = body.to as 'coins' | 'pearls'
  const points = Math.floor(Number(body.points) || 0)
  if (to !== 'coins' && to !== 'pearls') return NextResponse.json({ error: 'bad target' }, { status: 400 })
  if (points <= 0) return NextResponse.json({ error: '金額需大於 0' }, { status: 400 })

  const { data: user } = await supabaseAdmin.from('users').select('total_points').eq('id', userId).single()
  if (!user || user.total_points < points) return NextResponse.json({ error: '積分不足' }, { status: 400 })

  const amount = to === 'coins' ? points : Math.floor(points / 2)
  if (amount <= 0) return NextResponse.json({ error: '至少需 2 積分換 1 珍珠' }, { status: 400 })

  // 扣積分
  await supabaseAdmin.rpc('increment_points', { uid: userId, delta: -points })
  await supabaseAdmin.from('point_logs').insert({
    user_id: userId, amount: -points, source: 'redeem',
    description: `兌換 ${to === 'coins' ? `${amount} 農場金幣` : `${amount} 水族箱珍珠`}`,
  })

  if (to === 'coins') {
    await supabaseAdmin.from('farm').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })
    const { data: f } = await supabaseAdmin.from('farm').select('coins').eq('user_id', userId).single()
    await supabaseAdmin.from('farm').update({ coins: (f?.coins ?? 0) + amount, updated_at: new Date().toISOString() }).eq('user_id', userId)
  } else {
    await supabaseAdmin.from('aquarium').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })
    const { data: a } = await supabaseAdmin.from('aquarium').select('pearls').eq('user_id', userId).single()
    await supabaseAdmin.from('aquarium').update({ pearls: (a?.pearls ?? 0) + amount, updated_at: new Date().toISOString() }).eq('user_id', userId)
  }

  const { data: after } = await supabaseAdmin.from('users').select('total_points').eq('id', userId).single()
  return NextResponse.json({ ok: true, spent: points, gained: amount, to, remainingPoints: after?.total_points ?? 0 })
}
