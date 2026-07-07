import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { GAME_INFO } from '@/lib/gameInfo'
import { todayTW } from '@/lib/quests'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 處方系統 v1（規格書 §5.2 精簡版）：治療師開立/停用，個案端看今日處方＋本週進度。

async function getRole(userId: string) {
  const { data } = await supabaseAdmin.from('users').select('role').eq('id', userId).single()
  return data?.role ?? 'patient'
}

/** 本週一 00:00（台灣）的 UTC ISO */
function weekStartUTC(): string {
  const d = todayTW()
  const tw = new Date(`${d}T00:00:00Z`)
  const dow = (tw.getUTCDay() + 6) % 7
  return new Date(tw.getTime() - dow * 86400_000 - 8 * 3600_000).toISOString()
}

// GET：治療師帶 userId 看該個案處方；個案不帶參數看自己的（含本週進度）
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ prescriptions: null })
  const me = session.user.id
  const userId = req.nextUrl.searchParams.get('userId')

  if (userId) {
    if (await getRole(me) !== 'therapist') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const { data } = await supabaseAdmin
      .from('prescriptions')
      .select('id, game_type, difficulty_params, sessions_per_week, note, active, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(20)
    return NextResponse.json({ prescriptions: data ?? [] })
  }

  // 個案：自己的有效處方 + 本週各遊戲完成次數
  const [{ data: rxs }, { data: weekSessions }] = await Promise.all([
    supabaseAdmin.from('prescriptions')
      .select('id, game_type, difficulty_params, sessions_per_week, note')
      .eq('user_id', me).eq('active', true).order('created_at', { ascending: false }),
    supabaseAdmin.from('game_sessions')
      .select('game_type').eq('user_id', me).gte('created_at', weekStartUTC()),
  ])
  const doneBy = new Map<string, number>()
  for (const s of weekSessions ?? []) doneBy.set(s.game_type, (doneBy.get(s.game_type) ?? 0) + 1)

  return NextResponse.json({
    prescriptions: (rxs ?? []).map(r => ({
      ...r,
      week_done: Math.min(doneBy.get(r.game_type) ?? 0, r.sessions_per_week),
    })),
  })
}

// POST（治療師）：開立處方
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await getRole(session.user.id) !== 'therapist') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const gameType = String(body.game_type ?? '')
  const difficulty = ['easy', 'medium', 'hard'].includes(body.difficulty) ? body.difficulty : 'easy'
  const perWeek = Math.max(1, Math.min(7, Math.floor(Number(body.sessions_per_week) || 3)))
  if (!body.user_id || !GAME_INFO[gameType]) return NextResponse.json({ error: '缺少個案或遊戲不存在' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('prescriptions').insert({
    user_id: body.user_id,
    therapist_id: session.user.id,
    game_type: gameType,
    difficulty_params: { difficulty },
    sessions_per_week: perWeek,
    note: body.note ? String(body.note).slice(0, 200) : null,
  }).select().single()
  if (error) {
    console.error('prescription insert failed:', error)
    return NextResponse.json({ error: '開立失敗' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, prescription: data })
}

// PATCH（治療師）：停用處方
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await getRole(session.user.id) !== 'therapist') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'missing id' }, { status: 400 })
  const { error } = await supabaseAdmin.from('prescriptions')
    .update({ active: false }).eq('id', body.id)
  if (error) return NextResponse.json({ error: '停用失敗' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
