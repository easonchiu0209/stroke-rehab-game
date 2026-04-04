// ── 碰點收集遊戲常數與型別 ────────────────────────────────────────

export type TcDifficulty = 'easy' | 'medium' | 'hard'

export interface TcDotColor {
  fill:   string
  stroke: string
  light:  string
}

export const TC_DOT_COLORS: TcDotColor[] = [
  { fill: 'rgba(59,  130, 246, 0.92)', stroke: '#1d4ed8', light: 'rgba(59,  130, 246, 0.18)' }, // blue
  { fill: 'rgba(239, 68,  68,  0.92)', stroke: '#b91c1c', light: 'rgba(239, 68,  68,  0.18)' }, // red
  { fill: 'rgba(234, 179, 8,   0.95)', stroke: '#a16207', light: 'rgba(234, 179, 8,   0.18)' }, // yellow
  { fill: 'rgba(168, 85,  247, 0.92)', stroke: '#6d28d9', light: 'rgba(168, 85,  247, 0.18)' }, // purple
  { fill: 'rgba(249, 115, 22,  0.92)', stroke: '#c2410c', light: 'rgba(249, 115, 22,  0.18)' }, // orange
  { fill: 'rgba(20,  184, 166, 0.92)', stroke: '#0d9488', light: 'rgba(20,  184, 166, 0.18)' }, // teal
  { fill: 'rgba(236, 72,  153, 0.92)', stroke: '#9d174d', light: 'rgba(236, 72,  153, 0.18)' }, // pink
  { fill: 'rgba(34,  197, 94,  0.92)', stroke: '#15803d', light: 'rgba(34,  197, 94,  0.18)' }, // green
  { fill: 'rgba(99,  102, 241, 0.92)', stroke: '#3730a3', light: 'rgba(99,  102, 241, 0.18)' }, // indigo
]

export interface TcLevelConfig {
  dotCount:     number
  radiusPx:     number         // radius at 640px canvas width reference
  holdMs:       number         // ms wrist must stay inside dot
  timeLimitMs:  number | null  // per-dot time limit; null = unlimited
  label:        string
  emoji:        string
  description:  string
  levelBadge:   string         // Tailwind classes for badge
}

export const TC_LEVEL_CONFIGS: Record<TcDifficulty, TcLevelConfig> = {
  easy: {
    dotCount:    3,
    radiusPx:    80,
    holdMs:      1000,
    timeLimitMs: null,
    label:       '輕鬆',
    emoji:       '🌱',
    description: '3 個大目標點・無時間限制',
    levelBadge:  'bg-green-100 text-green-800',
  },
  medium: {
    dotCount:    6,
    radiusPx:    55,
    holdMs:      1000,
    timeLimitMs: 15000,
    label:       '一般',
    emoji:       '⚡',
    description: '6 個目標點・每點 15 秒限時',
    levelBadge:  'bg-yellow-100 text-yellow-800',
  },
  hard: {
    dotCount:    9,
    radiusPx:    32,
    holdMs:      800,
    timeLimitMs: 8000,
    label:       '挑戰',
    emoji:       '🔥',
    description: '9 個小目標點・每點 8 秒限時',
    levelBadge:  'bg-red-100 text-red-800',
  },
}

export interface TcDot {
  id:        number
  nx:        number     // normalized display-x (0-1)
  ny:        number     // normalized display-y (0-1)
  color:     TcDotColor
  collected: boolean
}

/** Reference canvas width used for radius normalization */
const BASE_W = 640

/**
 * Generate N non-overlapping dots in normalized (display) coordinates.
 * Dots are placed in the upper 80% of the canvas so the patient's hand
 * can reach from the bottom.
 */
export function generateTcDots(count: number, radiusPx: number): TcDot[] {
  const rNorm   = radiusPx / BASE_W
  const margin  = 1.4 * rNorm
  const minDist = 2.7 * rNorm  // minimum center-to-center distance (normalized)

  const dots: TcDot[] = []
  let attempts = 0

  while (dots.length < count && attempts < 12000) {
    attempts++
    const nx = margin + Math.random() * (1 - 2 * margin)
    // Keep dots in upper 75% so hand can reach all of them
    const ny = margin + Math.random() * (0.78 - 2 * margin)

    // Check minimum separation (normalized, account for 4:3 aspect)
    const tooClose = dots.some((d) => {
      const dx = d.nx - nx
      const dy = (d.ny - ny) * 0.75   // compensate for 4:3 aspect ratio
      return Math.sqrt(dx * dx + dy * dy) < minDist
    })

    if (!tooClose) {
      dots.push({
        id:        dots.length,
        nx,
        ny,
        color:     TC_DOT_COLORS[dots.length % TC_DOT_COLORS.length],
        collected: false,
      })
    }
  }

  return dots
}
