import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 貼文留言：列表 / 新增 / 刪自己的

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const postId = req.nextUrl.searchParams.get('postId')
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('post_comments')
    .select('id, content, created_at, user_id, users!post_comments_user_id_fkey(display_name, nickname, picture_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) {
    console.error('comments list failed:', error)
    return NextResponse.json({ error: '載入留言失敗' }, { status: 500 })
  }
  const me = session.user.id
  return NextResponse.json({
    comments: (data ?? []).map(c => {
      const author = Array.isArray(c.users) ? c.users[0] : c.users
      return {
        id: c.id,
        content: c.content,
        created_at: c.created_at,
        author_name: author?.nickname || author?.display_name || '使用者',
        author_pic: author?.picture_url ?? null,
        isMine: c.user_id === me,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const postId = String(body.post_id ?? '')
  const content = String(body.content ?? '').trim().slice(0, 200)
  if (!postId || !content) return NextResponse.json({ error: '請輸入留言內容' }, { status: 400 })

  const { error } = await supabaseAdmin.from('post_comments')
    .insert({ post_id: postId, user_id: session.user.id, content })
  if (error) {
    console.error('comment insert failed:', error)
    return NextResponse.json({ error: '留言失敗，請稍後再試' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'no id' }, { status: 400 })
  await supabaseAdmin.from('post_comments').delete().eq('id', id).eq('user_id', session.user.id)
  return NextResponse.json({ ok: true })
}
