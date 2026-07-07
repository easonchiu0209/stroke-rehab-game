import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// 疼痛 NRS 回報（0–10）：結算頁回報後補寫到該場 session。
// 只能寫自己的 session；pain_score 欄位未建（SQL 待套用）時回 ok:false 不擋流程。
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const sessionId = String(body.session_id ?? '')
  const pain = Math.round(Number(body.pain))
  if (!sessionId || !Number.isFinite(pain) || pain < 0 || pain > 10) {
    return NextResponse.json({ error: 'bad input' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('game_sessions')
    .update({ pain_score: pain })
    .eq('id', sessionId)
    .eq('user_id', session.user.id)   // 只能寫自己的場次

  if (error) {
    console.error('pain report failed:', error)
    return NextResponse.json({ ok: false })
  }
  return NextResponse.json({ ok: true })
}
