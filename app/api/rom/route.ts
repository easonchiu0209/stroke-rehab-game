import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 登入者自己的 ROM 歷史最佳（rom_records 表未建時回 null，前端優雅降級）
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ best: null })

  const joint = req.nextUrl.searchParams.get('joint') ?? 'shoulder'
  const motion = req.nextUrl.searchParams.get('motion') ?? 'flexion'

  const { data, error } = await supabaseAdmin
    .from('rom_records')
    .select('angle_deg')
    .eq('user_id', session.user.id)
    .eq('joint', joint)
    .eq('motion', motion)
    .order('angle_deg', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ best: null })
  return NextResponse.json({ best: data ? Math.round(data.angle_deg) : null })
}
