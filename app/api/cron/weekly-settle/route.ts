import { NextResponse } from 'next/server'
import { settleWeeklyRewards } from '@/lib/serverPoints'

// 每週結算備援端點（也可由 Vercel Cron 觸發）。結算本身具冪等性，重複呼叫不會重發。
export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await settleWeeklyRewards()
  return NextResponse.json(result)
}
