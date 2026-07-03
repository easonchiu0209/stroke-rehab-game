import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// 切換「💪 加油」
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user.id
  const body = await req.json()
  const postId = String(body.postId ?? '')
  if (!postId) return NextResponse.json({ error: 'no postId' }, { status: 400 })

  const { data: existing } = await supabaseAdmin.from('post_cheers').select('post_id').eq('post_id', postId).eq('user_id', me).maybeSingle()
  if (existing) {
    await supabaseAdmin.from('post_cheers').delete().eq('post_id', postId).eq('user_id', me)
    return NextResponse.json({ cheered: false })
  }
  await supabaseAdmin.from('post_cheers').insert({ post_id: postId, user_id: me })
  return NextResponse.json({ cheered: true })
}
