// ════════════════════════════════════════════════════════════════════
// wipeTraceConstants.ts — Level 3「擦拭軌跡」型別、設定、路徑模板
// ════════════════════════════════════════════════════════════════════

export type WtDifficulty = 'easy' | 'medium' | 'hard'

/** 單個路徑點，正規化 display-space 座標 (0-1) */
export interface WtWaypoint {
  x: number
  y: number
}

/** 一條命名路徑，由 20 個有序路徑點組成 */
export interface WtPath {
  id:        string
  label:     string
  waypoints: WtWaypoint[]  // 固定 20 點，start→end
}

/** 每種難度的遊戲設定 */
export interface WtLevelConfig {
  totalRounds: number
  tolerancePx: number   // 以 640px canvas 寬度為基準的命中容差
  timeLimitMs: number   // 每回合時間限制（ms）
  pathIds:     string[] // 輪流使用的路徑 ID 列表
  label:       string
  emoji:       string
  description: string
  levelBadge:  string   // Tailwind CSS classes
}

/** 每回合結束後記錄的成果 */
export interface WtRoundResult {
  pathId:         string
  pathLabel:      string
  completionRate: number   // 0-1（擦過的路徑點比例）
  timeUsedMs:     number
  completed:      boolean  // completionRate === 1.0
}

// ── 難度設定 ──────────────────────────────────────────────────────

export const WT_LEVEL_CONFIGS: Record<WtDifficulty, WtLevelConfig> = {
  easy: {
    totalRounds: 3,
    tolerancePx: 70,
    timeLimitMs: 20_000,
    pathIds:     ['horizontal', 'diagonal'],
    label:       '輕鬆',
    emoji:       '🌱',
    description: '3 回合・直線路徑・70px 容差・20 秒',
    levelBadge:  'bg-green-100 text-green-800',
  },
  medium: {
    totalRounds: 4,
    tolerancePx: 50,
    timeLimitMs: 15_000,
    pathIds:     ['horizontal', 'diagonal', 'arc'],
    label:       '一般',
    emoji:       '⚡',
    description: '4 回合・曲線路徑・50px 容差・15 秒',
    levelBadge:  'bg-yellow-100 text-yellow-800',
  },
  hard: {
    totalRounds: 5,
    tolerancePx: 30,
    timeLimitMs: 10_000,
    pathIds:     ['horizontal', 'diagonal', 'arc', 'scurve', 'zigzag'],
    label:       '挑戰',
    emoji:       '🔥',
    description: '5 回合・S 曲線/折線・30px 容差・10 秒',
    levelBadge:  'bg-red-100 text-red-800',
  },
}

// ── 路徑產生輔助函式 ──────────────────────────────────────────────

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function quadBez(
  p0: WtWaypoint, p1: WtWaypoint, p2: WtWaypoint, t: number,
): WtWaypoint {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  }
}

function cubicBez(
  p0: WtWaypoint, p1: WtWaypoint, p2: WtWaypoint, p3: WtWaypoint, t: number,
): WtWaypoint {
  const u = 1 - t
  return {
    x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
    y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
  }
}

/** 依弧長等距取樣折線路徑上的 n 個點 */
function arcLengthSample(anchors: WtWaypoint[], n: number): WtWaypoint[] {
  const segLens: number[] = []
  for (let i = 0; i < anchors.length - 1; i++) {
    const dx = anchors[i + 1].x - anchors[i].x
    const dy = anchors[i + 1].y - anchors[i].y
    segLens.push(Math.sqrt(dx * dx + dy * dy))
  }
  const total = segLens.reduce((a, b) => a + b, 0)
  const pts: WtWaypoint[] = []
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total
    let cum = 0
    for (let i = 0; i < anchors.length - 1; i++) {
      const next = cum + segLens[i]
      if (next >= target || i === anchors.length - 2) {
        const t = segLens[i] > 0 ? (target - cum) / segLens[i] : 0
        pts.push({
          x: lerp(anchors[i].x, anchors[i + 1].x, Math.min(t, 1)),
          y: lerp(anchors[i].y, anchors[i + 1].y, Math.min(t, 1)),
        })
        break
      }
      cum = next
    }
  }
  return pts
}

// ── 5 條路徑模板 ──────────────────────────────────────────────────

const N = 20  // 每條路徑的路徑點數

// Path 1: horizontal — 水平從左到右
const horizontalWaypoints: WtWaypoint[] = Array.from({ length: N }, (_, i) => ({
  x: 0.10 + (0.80 / (N - 1)) * i,
  y: 0.50,
}))

// Path 2: diagonal — 從左上到右下
const diagonalWaypoints: WtWaypoint[] = Array.from({ length: N }, (_, i) => ({
  x: 0.12 + (0.76 / (N - 1)) * i,
  y: 0.20 + (0.58 / (N - 1)) * i,
}))

// Path 3: arc — 二次貝茲弧形（左→右，中間向上）
const arcWaypoints: WtWaypoint[] = Array.from({ length: N }, (_, i) =>
  quadBez({ x: 0.10, y: 0.72 }, { x: 0.50, y: 0.12 }, { x: 0.90, y: 0.72 }, i / (N - 1)),
)

// Path 4: scurve — 三次貝茲 S 曲線
const scurveWaypoints: WtWaypoint[] = Array.from({ length: N }, (_, i) =>
  cubicBez(
    { x: 0.10, y: 0.22 }, { x: 0.62, y: 0.22 },
    { x: 0.38, y: 0.78 }, { x: 0.90, y: 0.78 },
    i / (N - 1),
  ),
)

// Path 5: zigzag — 折線（弧長等距取樣）
const zigzagWaypoints: WtWaypoint[] = arcLengthSample([
  { x: 0.10, y: 0.50 },
  { x: 0.32, y: 0.20 },
  { x: 0.54, y: 0.78 },
  { x: 0.76, y: 0.22 },
  { x: 0.90, y: 0.50 },
], N)

export const WT_PATHS: Record<string, WtPath> = {
  horizontal: { id: 'horizontal', label: '水平直線', waypoints: horizontalWaypoints },
  diagonal:   { id: 'diagonal',   label: '斜線',     waypoints: diagonalWaypoints   },
  arc:        { id: 'arc',        label: '弧形曲線', waypoints: arcWaypoints         },
  scurve:     { id: 'scurve',     label: 'S 曲線',   waypoints: scurveWaypoints      },
  zigzag:     { id: 'zigzag',     label: '折線',     waypoints: zigzagWaypoints      },
}

/** 依設定為一整局產生路徑陣列（輪流使用 pathIds） */
export function selectPathsForSession(config: WtLevelConfig): WtPath[] {
  return Array.from({ length: config.totalRounds }, (_, i) =>
    WT_PATHS[config.pathIds[i % config.pathIds.length]],
  )
}
