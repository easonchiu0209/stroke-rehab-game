import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// 設定暱稱（發文/排行榜顯示用；留空＝恢復用 LINE 名稱）
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const raw = String(body.nickname ?? '').trim().slice(0, 20)
  await supabaseAdmin.from('users').update({ nickname: raw || null, updated_at: new Date().toISOString() }).eq('id', session.user.id)
  return NextResponse.json({ ok: true, nickname: raw || null })
}

// 個人頁資料（成就、已解鎖、最近記錄）—— 走 service role + 登入驗證，
// 讓前端不再用 anon key 直接讀敏感資料表。
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [allAch, earned, sessions, me] = await Promise.all([
    supabaseAdmin.from('achievements').select('*'),
    supabaseAdmin.from('user_achievements').select('achievement_id, earned_at').eq('user_id', session.user.id),
    supabaseAdmin.from('game_sessions').select('*').eq('user_id', session.user.id)
      .order('created_at', { ascending: false }).limit(20),
    supabaseAdmin.from('users').select('nickname').eq('id', session.user.id).single(),
  ])

  return NextResponse.json({
    achievements: allAch.data ?? [],
    earned:       earned.data ?? [],
    sessions:     sessions.data ?? [],
    nickname:     me.data?.nickname ?? null,
  })
}
