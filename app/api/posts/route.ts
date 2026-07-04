import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 社群貼文：公開貼文 + 自己的私人貼文
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user.id

  const { data: meRow } = await supabaseAdmin.from('users').select('display_name, nickname').eq('id', me).single()
  const myName = meRow?.nickname || meRow?.display_name || '使用者'
  const hasNickname = !!meRow?.nickname

  const { data: rows } = await supabaseAdmin
    .from('posts')
    .select('id, content, visibility, created_at, user_id, users(display_name, nickname, picture_url)')
    .or(`visibility.eq.public,user_id.eq.${me}`)
    .order('created_at', { ascending: false })
    .limit(60)

  const ids = (rows ?? []).map(r => r.id)
  const cheerMap = new Map<string, { count: number; mine: boolean }>()
  if (ids.length) {
    const { data: cheers } = await supabaseAdmin.from('post_cheers').select('post_id, user_id').in('post_id', ids)
    for (const c of cheers ?? []) {
      const e = cheerMap.get(c.post_id) ?? { count: 0, mine: false }
      e.count++; if (c.user_id === me) e.mine = true
      cheerMap.set(c.post_id, e)
    }
  }

  const posts = (rows ?? []).map(r => {
    const author = Array.isArray(r.users) ? r.users[0] : r.users
    const c = cheerMap.get(r.id) ?? { count: 0, mine: false }
    return {
      id: r.id, content: r.content, visibility: r.visibility, created_at: r.created_at,
      author_name: author?.nickname || author?.display_name || '使用者', author_pic: author?.picture_url ?? null,
      cheers: c.count, cheeredByMe: c.mine, isMine: r.user_id === me,
    }
  })
  return NextResponse.json({ posts, myName, hasNickname })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const content = String(body.content ?? '').trim()
  if (!content) return NextResponse.json({ error: '請輸入內容' }, { status: 400 })
  const visibility = body.visibility === 'private' ? 'private' : 'public'
  const { error } = await supabaseAdmin.from('posts').insert({ user_id: session.user.id, content: content.slice(0, 500), visibility })
  if (error) {
    console.error('post insert failed:', error)
    return NextResponse.json({ error: '發布失敗，請稍後再試' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'no id' }, { status: 400 })
  await supabaseAdmin.from('posts').delete().eq('id', id).eq('user_id', session.user.id)
  return NextResponse.json({ ok: true })
}
