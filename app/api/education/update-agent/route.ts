import { NextResponse } from 'next/server'
import { runEducationUpdateAgent } from '@/lib/educationUpdateAgent'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const report = await runEducationUpdateAgent()
  return NextResponse.json(report)
}
