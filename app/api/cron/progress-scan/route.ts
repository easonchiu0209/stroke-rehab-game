import { NextResponse } from 'next/server'
import { runProgressScan } from '@/lib/progressAgent'

// AI 進步追蹤掃描（Vercel Cron 每週一 08:30 台灣；upsert 冪等可重跑）
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const result = await runProgressScan()
  return NextResponse.json(result)
}
