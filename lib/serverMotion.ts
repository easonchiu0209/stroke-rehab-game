// 伺服器端：動作錄製/代償事件/品質指標 落庫（Phase 1 AI 基礎建設）
// 由 /api/game/save 與 /api/farm 共用。失敗只記 log，不影響主存檔流程。

import { supabaseAdmin } from '@/lib/supabase'
import { computeKinematics } from '@/lib/kinematics'
import { computePerformanceIndex, nextDdaState, DIFF_TO_LEVEL, LEVEL_TO_DIFF, type Difficulty } from '@/lib/dda'

const COMP_TYPES = new Set(['shrug', 'trunk_lean', 'trunk_tilt'])

export interface DdaResult {
  performance_index: number
  recommended_difficulty: string
  difficulty_changed: -1 | 0 | 1
}

export async function saveMotionData(
  userId: string, sessionId: string,
  body: Record<string, unknown>, trajectory: number[][] | null,
): Promise<DdaResult | null> {
  try {
    const poseFrames = Array.isArray(body.pose_frames) ? (body.pose_frames as number[][]).slice(0, 4000) : []
    const landmarkIds = Array.isArray(body.pose_landmark_ids) ? body.pose_landmark_ids : []
    const rawComps = Array.isArray(body.compensations) ? body.compensations : []
    const comps = (rawComps as Array<Record<string, unknown>>)
      .filter(e => e && COMP_TYPES.has(String(e.type)) && Number.isFinite(Number(e.t_ms)))
      .slice(0, 300)

    if (poseFrames.length) {
      await supabaseAdmin.from('motion_frames').insert({
        session_id: sessionId, user_id: userId,
        landmark_ids: landmarkIds,
        fps: Number(body.pose_fps) || 10,
        frames: poseFrames,
      })
    }
    if (comps.length) {
      await supabaseAdmin.from('compensation_events').insert(comps.map(e => ({
        session_id: sessionId, user_id: userId,
        t_ms: Math.round(Number(e.t_ms)),
        dur_ms: Math.round(Number(e.dur_ms) || 0),
        type: String(e.type),
        severity: Math.max(0, Math.min(1, Number(e.severity) || 0)),
      })))
    }

    // ── DDA 場末升降級（AI 指引 L1）────────────────────────
    let dda: DdaResult | null = null
    let ddaLog: Record<string, unknown> | null = null
    const gameType = typeof body.game_type === 'string' ? body.game_type : null
    const index = computePerformanceIndex({
      hits:   Number(body.hits)   || 0,
      misses: Number(body.misses) || 0,
      avgReactionMs: body.avg_reaction_ms != null ? Number(body.avg_reaction_ms) : null,
      compensationCount: comps.length,
    })
    if (index != null && gameType) {
      const { data: st } = await supabaseAdmin
        .from('dda_state')
        .select('level, streak_high, streak_low')
        .eq('user_id', userId).eq('game_type', gameType)
        .maybeSingle()
      const cur = st ?? {
        level: DIFF_TO_LEVEL[body.difficulty as Difficulty] ?? 2,
        streak_high: 0, streak_low: 0,
      }
      const next = nextDdaState(cur, index)
      await supabaseAdmin.from('dda_state').upsert({
        user_id: userId, game_type: gameType,
        level: next.level, streak_high: next.streak_high, streak_low: next.streak_low,
        updated_at: new Date().toISOString(),
      })
      dda = {
        performance_index: index,
        recommended_difficulty: LEVEL_TO_DIFF[next.level],
        difficulty_changed: next.change,
      }
      ddaLog = { index, level_before: cur.level, level_after: next.level }
    }

    const kin = computeKinematics(trajectory)
    if (kin || comps.length || index != null) {
      const count = (t: string) => comps.filter(e => e.type === t).length
      await supabaseAdmin.from('quality_metrics').insert({
        session_id: sessionId, user_id: userId,
        path_length:      kin?.pathLength      ?? null,
        path_efficiency:  kin?.pathEfficiency  ?? null,
        mean_speed:       kin?.meanSpeed       ?? null,
        peak_speed:       kin?.peakSpeed       ?? null,
        num_submovements: kin?.numSubmovements ?? null,
        jerk_index:       kin?.jerkIndex       ?? null,
        rom_x:            kin?.romX            ?? null,
        rom_y:            kin?.romY            ?? null,
        shrug_count:      count('shrug'),
        trunk_lean_count: count('trunk_lean'),
        trunk_tilt_count: count('trunk_tilt'),
        compensation_ms:  comps.reduce((s, e) => s + (Math.round(Number(e.dur_ms)) || 0), 0),
        performance_index: index,
        dda_log:          ddaLog,
      })
    }
    return dda
  } catch (e) {
    console.error('saveMotionData failed:', e)
    return null
  }
}
