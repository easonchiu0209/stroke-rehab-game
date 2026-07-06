import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { LEVEL_TO_DIFF } from '@/lib/dda'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 回傳 AI 建議的開場難度（依 dda_state；無紀錄回 null）
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ difficulty: null })

  const gameType = req.nextUrl.searchParams.get('game_type')
  if (!gameType) return NextResponse.json({ error: 'game_type required' }, { status: 400 })

  const { data } = await supabaseAdmin
    .from('dda_state')
    .select('level')
    .eq('user_id', session.user.id)
    .eq('game_type', gameType)
    .maybeSingle()

  return NextResponse.json({ difficulty: data ? LEVEL_TO_DIFF[data.level] ?? null : null })
}
