import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { todayTW } from '@/lib/quests'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 家人分享卡數據：本月訓練統計（只回數據事實，文案由前端固定模板呈現 — 合規）
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ stats: null })
  const userId = session.user.id

  const today = todayTW()                                  // YYYY-MM-DD（台灣）
  const monthStartTW = today.slice(0, 8) + '01'
  const monthStartUTC = new Date(new Date(`${monthStartTW}T00:00:00Z`).getTime() - 8 * 3600_000)

  const [{ data: user }, { data: sessions }, { data: romNow }, { data: romPrev }] = await Promise.all([
    supabaseAdmin.from('users').select('display_name, nickname').eq('id', userId).single(),
    supabaseAdmin.from('game_sessions')
      .select('created_at, accuracy')
      .eq('user_id', userId).gte('created_at', monthStartUTC.toISOString()),
    supabaseAdmin.from('rom_records')
      .select('angle_deg').eq('user_id', userId).eq('joint', 'shoulder').eq('motion', 'flexion')
      .gte('measured_at', monthStartUTC.toISOString())
      .order('angle_deg', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('rom_records')
      .select('angle_deg').eq('user_id', userId).eq('joint', 'shoulder').eq('motion', 'flexion')
      .lt('measured_at', monthStartUTC.toISOString())
      .order('angle_deg', { ascending: false }).limit(1).maybeSingle(),
  ])

  const rows = sessions ?? []
  const dayOf = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10)
  const days = new Set(rows.map(r => dayOf(r.created_at)))
  const accs = rows.map(r => r.accuracy).filter((x): x is number => x != null)

  // 連續天數（今天或昨天有練起算，往回數）
  let streak = 0
  const d = new Date(`${today}T00:00:00Z`)
  if (!days.has(today)) d.setUTCDate(d.getUTCDate() - 1)   // 今天還沒練就從昨天算
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++
    d.setUTCDate(d.getUTCDate() - 1)
  }

  const romDelta = romNow?.angle_deg != null && romPrev?.angle_deg != null
    ? Math.round(romNow.angle_deg - romPrev.angle_deg)
    : null

  return NextResponse.json({
    stats: {
      name: user?.nickname || user?.display_name || '我',
      monthLabel: `${Number(today.slice(5, 7))} 月`,
      days: days.size,
      sessions: rows.length,
      avgAcc: accs.length ? Math.round(accs.reduce((s, v) => s + v, 0) / accs.length) : null,
      streak,
      romDelta: romDelta != null && romDelta > 0 ? romDelta : null,   // 只在有進步時呈現（不呈現負值，避免挫折）
    },
  })
}
