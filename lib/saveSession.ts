// 共用：把一場遊戲的訓練數據存到後端（給治療師後台分析用）
// 所有遊戲結束時都該呼叫，未登入會被 API 擋下（靜默忽略）。

export interface HitPoint { nx: number; ny: number }

/** 由命中座標算出左/中/右分布 + 3×3 熱區（供患側分析） */
export function computeZones(points: HitPoint[]) {
  const left   = points.filter(p => p.nx < 0.35).length
  const right  = points.filter(p => p.nx > 0.65).length
  const center = points.length - left - right
  const heatmap = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, col) =>
      points.filter(p =>
        p.nx >= col / 3 && p.nx < (col + 1) / 3 &&
        p.ny >= row / 3 && p.ny < (row + 1) / 3,
      ).length,
    ),
  )
  // 最高伸手（ny 越小越高）
  const highestReach = points.length > 0
    ? Math.round((1 - Math.min(...points.map(p => p.ny))) * 100)
    : null
  return { left_hits: left, center_hits: center, right_hits: right, zone_heatmap: heatmap, highest_reach: highestReach }
}

export interface SaveSessionPayload {
  game_type: string
  difficulty: string
  score: number
  hits: number
  misses: number
  avg_reaction_ms?: number | null
  highest_reach?: number | null
  left_hits?: number
  right_hits?: number
  center_hits?: number
  zone_heatmap?: number[][]
  trajectory?: number[][]   // [[t_ms, nx, ny], ...] 約 10Hz 取樣的手部軌跡
  duration_secs?: number
  // Pose 動作錄製（usePoseMonitor 自動附上）
  pose_frames?: number[][]        // [[t_ms, x0,y0, ...], ...] 上半身 landmark 序列
  pose_landmark_ids?: number[]    // 每幀 t 之後的 landmark 順序
  pose_fps?: number
  compensations?: CompensationEvent[]
}

// ── Pose 動作/代償共享暫存（與手部軌跡同一套機制）──────────
export type CompensationType = 'shrug' | 'trunk_lean' | 'trunk_tilt'
export interface CompensationEvent {
  t_ms: number; dur_ms: number; type: CompensationType; severity: number
}
export interface PoseRecording {
  landmarkIds: number[]
  fps: number
  frames: number[][]            // 監測 hook 持續 push
  events: CompensationEvent[]   // 監測 hook 持續 push
}
let _livePose: PoseRecording | null = null
export function recordPose(rec: PoseRecording) { _livePose = rec }
export function takePose(): PoseRecording | null {
  const p = _livePose; _livePose = null; return p
}

// ── 手部軌跡共享暫存 ─────────────────────────────────────────
// 偵測引擎（hook）每場開始時用 recordTrajectory 登記它的軌跡陣列（會持續被 push），
// 存檔時用 takeTrajectory 取出並清空，自動附到 payload。避免逐遊戲串接 callback。
let _liveTraj: number[][] | null = null
export function recordTrajectory(arr: number[][]) { _liveTraj = arr }
export function takeTrajectory(): number[][] {
  const t = _liveTraj; _liveTraj = null; return t ?? []
}

export async function saveGameSession(payload: SaveSessionPayload): Promise<void> {
  try {
    let body = payload
    if (!body.trajectory) {
      const t = takeTrajectory()
      if (t.length) body = { ...body, trajectory: t }
    }
    if (!body.pose_frames) {
      const p = takePose()
      if (p && (p.frames.length || p.events.length)) {
        body = {
          ...body,
          pose_frames: p.frames,
          pose_landmark_ids: p.landmarkIds,
          pose_fps: p.fps,
          compensations: p.events,
        }
      }
    }
    await fetch('/api/game/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch { /* 未登入或離線：靜默忽略 */ }
}
