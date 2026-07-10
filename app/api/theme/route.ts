import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { THEMES } from '@/lib/themes'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 佈景主題：讀取目前主題與已擁有清單 / 切換主題。
// users.active_theme / owned_items 欄位未建（SQL 待套用）時優雅降級為預設主題。

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ active: 'default', owned: [] })
  try {
    const { data, error } = await supabaseAdmin
      .from('users').select('active_theme, owned_items').eq('id', session.user.id).maybeSingle()
    if (error || !data) return NextResponse.json({ active: 'default', owned: [] })
    const owned = (Array.isArray(data.owned_items) ? data.owned_items as string[] : [])
      .filter(i => i.startsWith('theme:')).map(i => i.replace('theme:', ''))
    const active = data.active_theme && THEMES[data.active_theme] ? data.active_theme : 'default'
    return NextResponse.json({ active, owned })
  } catch {
    return NextResponse.json({ active: 'default', owned: [] })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const theme = String(body.theme ?? '')
  if (!THEMES[theme]) return NextResponse.json({ error: '無此主題' }, { status: 400 })

  if (theme !== 'default') {
    const { data } = await supabaseAdmin
      .from('users').select('owned_items').eq('id', session.user.id).maybeSingle()
    const owned = Array.isArray(data?.owned_items) ? (data.owned_items as string[]) : []
    if (!owned.includes(`theme:${theme}`)) return NextResponse.json({ error: '尚未擁有此主題' }, { status: 400 })
  }
  const { error } = await supabaseAdmin
    .from('users').update({ active_theme: theme }).eq('id', session.user.id)
  if (error) return NextResponse.json({ error: '切換失敗' }, { status: 500 })
  return NextResponse.json({ ok: true, active: theme })
}
