import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// Points formula
function calcPoints(score: number, accuracy: number, difficulty: string): number {
  const base        = Math.floor(score * 0.5)
  const accuracyBonus = accuracy >= 80 ? 20 : accuracy >= 60 ? 10 : 0
  const diffBonus   = difficulty === 'hard' ? 15 : difficulty === 'medium' ? 8 : 0
  return base + accuracyBonus + diffBonus
}

// Check if user earns new achievements after this session
async function checkAchievements(userId: string, session: Record<string, unknown>) {
  const [{ data: stats }, { data: earned }] = await Promise.all([
    supabaseAdmin.from('game_sessions').select('hits, accuracy, highest_reach').eq('user_id', userId),
    supabaseAdmin.from('user_achievements').select('achievement_id').eq('user_id', userId),
  ])

  const earnedIds  = new Set((earned ?? []).map((r: { achievement_id: string }) => r.achievement_id))
  const totalHits  = (stats ?? []).reduce((s: number, r: { hits: number }) => s + r.hits, 0)
  const totalSessions = (stats ?? []).length
  const maxAccuracy   = Math.max(...(stats ?? []).map((r: { accuracy: number }) => r.accuracy), 0)
  const maxReach      = Math.max(...(stats ?? []).filter((r: { highest_reach: number | null }) => r.highest_reach != null).map((r: { highest_reach: number }) => r.highest_reach), 0)

  const { data: allAchievements } = await supabaseAdmin.from('achievements').select('*')
  const newlyEarned: string[] = []

  for (const ach of allAchievements ?? []) {
    if (earnedIds.has(ach.id)) continue
    let earned = false
    if (ach.condition_type === 'total_hits'     && totalHits     >= ach.condition_value) earned = true
    if (ach.condition_type === 'total_sessions' && totalSessions >= ach.condition_value) earned = true
    if (ach.condition_type === 'accuracy'       && maxAccuracy   >= ach.condition_value) earned = true
    if (ach.condition_type === 'highest_reach'  && maxReach      >= ach.condition_value) earned = true

    if (earned) {
      await supabaseAdmin.from('user_achievements').insert({ user_id: userId, achievement_id: ach.id })
      // Award bonus points
      if (ach.points_bonus > 0) {
        await supabaseAdmin.from('point_logs').insert({
          user_id:     userId,
          amount:      ach.points_bonus,
          source:      'achievement',
          description: `解鎖成就：${ach.name}`,
        })
        await supabaseAdmin.rpc('increment_points', { uid: userId, delta: ach.points_bonus })
      }
      newlyEarned.push(ach.id)
    }
  }
  return newlyEarned
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const {
    game_type, difficulty, score, hits, misses,
    avg_reaction_ms, highest_reach, left_hits, right_hits, center_hits, duration_secs,
  } = body

  const total    = hits + misses
  const accuracy = total > 0 ? Math.round((hits / total) * 100) : 0
  const points   = calcPoints(score, accuracy, difficulty)

  // Save game session
  const { data: savedSession, error } = await supabaseAdmin
    .from('game_sessions')
    .insert({
      user_id: session.user.id,
      game_type, difficulty, score, hits, misses, accuracy,
      avg_reaction_ms: avg_reaction_ms ?? null,
      highest_reach:   highest_reach   ?? null,
      left_hits:   left_hits   ?? 0,
      right_hits:  right_hits  ?? 0,
      center_hits: center_hits ?? 0,
      duration_secs: duration_secs ?? 60,
      points_earned: points,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Award points
  await supabaseAdmin.from('point_logs').insert({
    user_id:     session.user.id,
    amount:      points,
    source:      'game',
    description: `${game_type} ${difficulty} 獲得積分`,
    session_id:  savedSession.id,
  })
  await supabaseAdmin.rpc('increment_points', { uid: session.user.id, delta: points })

  // Check achievements
  const newAchievements = await checkAchievements(session.user.id, savedSession)

  return NextResponse.json({ points_earned: points, new_achievements: newAchievements })
}
