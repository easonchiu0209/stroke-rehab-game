import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 登入者自己的最新週報（個案版；治療師版由後台 API 提供）
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ report: null })

  const { data } = await supabaseAdmin
    .from('weekly_reports')
    .select('week_start, patient_message, stats, created_at')
    .eq('user_id', session.user.id)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ report: data ?? null })
}
