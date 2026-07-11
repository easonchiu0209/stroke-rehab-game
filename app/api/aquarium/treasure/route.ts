import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { collectTreasures } from '@/lib/aquariumTreasure'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 主人收集缸底寶物 → 珍珠 1:1
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await collectTreasures(session.user.id)
  if (!result) return NextResponse.json({ error: '缸底沒有寶物' }, { status: 400 })
  return NextResponse.json({ ok: true, ...result })
}
