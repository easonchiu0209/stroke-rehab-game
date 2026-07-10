import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// 確認呼叫者是治療師
async function requireTherapist() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return { ok: false as const, status: 401 }
  const { data } = await supabaseAdmin.from('users').select('role').eq('id', session.user.id).single()
  if (data?.role !== 'therapist') return { ok: false as const, status: 403 }
  return { ok: true as const, userId: session.user.id }
}

export async function GET(req: NextRequest) {
  const auth = await requireTherapist()
  if (!auth.ok) return NextResponse.json({ error: 'forbidden' }, { status: auth.status })

  const userId = req.nextUrl.searchParams.get('userId')

  // ── 單一個案的所有訓練記錄 + 每週摘要 + ROM ───────────────
  if (userId) {
    const [{ data: patient }, { data: sessions }, { data: reports }, { data: rom }] = await Promise.all([
      supabaseAdmin.from('users').select('id, display_name, picture_url, total_points, created_at').eq('id', userId).single(),
      supabaseAdmin.from('game_sessions').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabaseAdmin.from('weekly_reports')
        .select('week_start, therapist_summary, generated_by, created_at')
        .eq('user_id', userId).order('week_start', { ascending: false }).limit(12),
      supabaseAdmin.from('rom_records')   // 表未建（SQL 待套用）時 data 為 null，前端優雅降級
        .select('joint, motion, angle_deg, measured_at')
        .eq('user_id', userId).order('measured_at', { ascending: false }).limit(30),
    ])
    // AI 進步追蹤（最新一次掃描；表未建時優雅降級）
    const { data: latestScan } = await supabaseAdmin.from('progress_insights')
      .select('computed_at').eq('user_id', userId)
      .order('computed_at', { ascending: false }).limit(1).maybeSingle()
    const { data: insights } = latestScan
      ? await supabaseAdmin.from('progress_insights')
          .select('dimension, trend, delta, flag, detail, computed_at')
          .eq('user_id', userId).eq('computed_at', latestScan.computed_at)
      : { data: [] }
    return NextResponse.json({ patient, sessions: sessions ?? [], reports: reports ?? [], rom: rom ?? [], insights: insights ?? [] })
  }

  // ── 個案清單 + 摘要 ───────────────────────────────────────
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
  const [{ data: users }, { data: sessions }, { data: comps }] = await Promise.all([
    supabaseAdmin.from('users').select('id, display_name, picture_url, total_points, role, created_at'),
    supabaseAdmin.from('game_sessions').select('user_id, created_at, accuracy'),
    supabaseAdmin.from('compensation_events').select('user_id').gte('created_at', weekAgo),
  ])

  // 本週代償事件數（依從性紅點註記用）
  const compBy = new Map<string, number>()
  for (const c of comps ?? []) compBy.set(c.user_id, (compBy.get(c.user_id) ?? 0) + 1)

  const byUser = new Map<string, { count: number; last: string; accSum: number }>()
  for (const s of sessions ?? []) {
    const e = byUser.get(s.user_id) ?? { count: 0, last: '', accSum: 0 }
    e.count++; e.accSum += s.accuracy ?? 0
    if (!e.last || s.created_at > e.last) e.last = s.created_at
    byUser.set(s.user_id, e)
  }

  const patients = (users ?? [])
    .filter(u => u.role !== 'therapist')   // 個案清單不含治療師自己（但治療師若也有訓練仍可在自己帳號看）
    .map(u => {
      const e = byUser.get(u.id)
      return {
        id: u.id, display_name: u.display_name, picture_url: u.picture_url,
        total_points: u.total_points,
        session_count: e?.count ?? 0,
        last_active: e?.last ?? null,
        avg_accuracy: e && e.count ? Math.round(e.accSum / e.count) : null,
        comp_week: compBy.get(u.id) ?? 0,
      }
    })
    .sort((a, b) => (b.last_active ?? '').localeCompare(a.last_active ?? ''))

  // 也回傳治療師自己（方便自測），放最後
  const me = (users ?? []).find(u => u.id === auth.userId)
  if (me && me.role === 'therapist') {
    const e = byUser.get(me.id)
    patients.push({
      id: me.id, display_name: `${me.display_name}（我）`, picture_url: me.picture_url,
      total_points: me.total_points, session_count: e?.count ?? 0,
      last_active: e?.last ?? null, avg_accuracy: e && e.count ? Math.round(e.accSum / e.count) : null,
      comp_week: compBy.get(me.id) ?? 0,
    })
  }

  return NextResponse.json({ patients })
}
