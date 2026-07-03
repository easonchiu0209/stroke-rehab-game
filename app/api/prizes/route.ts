import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// 即時讀取（避免靜態快取造成庫存/資料過時）
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('prizes')
    .select('*')
    .eq('is_active', true)
    .order('points_cost', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
