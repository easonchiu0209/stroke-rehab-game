import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getMonthlyProgress } from '@/lib/monthlyBadge'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 登入者的本月全勤挑戰進度 + 歷史徽章
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ progress: null })
  return NextResponse.json({ progress: await getMonthlyProgress(session.user.id) })
}
