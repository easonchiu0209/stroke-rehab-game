import { NextResponse } from 'next/server'
import { runWeeklyReports } from '@/lib/weeklyReport'

// 每週一台灣 08:00（UTC 週一 00:00）由 Vercel Cron 觸發。
// 生成具冪等性（同人同週只生成一次），重複呼叫安全。
export const dynamic = 'force-dynamic'
export const maxDuration = 300  // LLM 逐人生成，放寬函式時限

export async function GET() {
  const result = await runWeeklyReports()
  return NextResponse.json(result)
}
