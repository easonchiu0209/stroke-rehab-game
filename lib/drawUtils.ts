import type { HandLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { TaskPosition, GameMode } from '@/types/game'
import type { TcDot } from '@/lib/touchCollectConstants'

// ── MediaPipe 21-landmark 連線定義 ──────────────────────────────
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // 拇指
  [0, 5], [5, 6], [6, 7], [7, 8],          // 食指
  [5, 9], [9, 10], [10, 11], [11, 12],     // 中指
  [9, 13], [13, 14], [14, 15], [15, 16],   // 無名指
  [13, 17], [17, 18], [18, 19], [19, 20],  // 小指
  [0, 17], [5, 9],                          // 手掌
]

// ── 區域顏色設定 ────────────────────────────────────────────────
const ZONE_FILL: Record<TaskPosition, string> = {
  left:   'rgba(249, 115, 22, 0.18)',   // orange
  center: 'rgba(59,  130, 246, 0.18)',  // blue
  right:  'rgba(139, 92,  246, 0.18)',  // violet
}
const ZONE_STROKE: Record<TaskPosition, string> = {
  left:   'rgba(249, 115, 22, 1)',
  center: 'rgba(59,  130, 246, 1)',
  right:  'rgba(139, 92,  246, 1)',
}
const ZONE_LABELS: Record<TaskPosition, string> = {
  left: '左', center: '中', right: '右',
}

export interface DrawAROptions {
  results: HandLandmarkerResult
  targetPosition: TaskPosition
  mode: GameMode
  /** 手進入目標區的時間戳 (performance.now())，null 表示尚未進入 */
  zoneEnteredAt: number | null
  holdDurationMs: number
  /**
   * true = 前置鏡頭 (user)
   * 視頻以 CSS scaleX(-1) 顯示，但 canvas 不套 CSS 鏡射。
   * 繪圖時需翻轉 landmark.x：drawX = (1 - lm.x) * w
   */
  isMirrored: boolean
}

/**
 * drawAROverlay
 * 在 canvas 上繪製：
 *   1. 區域分隔線 + 目標高亮（lateral 模式）
 *   2. 目標圓圈（near-reach 模式）
 *   3. 手部骨架 + 關鍵點
 *   4. 持握進度條（底部）
 */
export function drawAROverlay(canvas: HTMLCanvasElement, opts: DrawAROptions): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { width: w, height: h } = canvas
  const { results, targetPosition, mode, zoneEnteredAt, holdDurationMs, isMirrored } = opts

  ctx.clearRect(0, 0, w, h)

  // landmark x 的顯示座標換算
  const lmX = (x: number) => isMirrored ? (1 - x) * w : x * w
  const lmY = (y: number) => y * h

  // ── Lateral 模式：三區域 ────────────────────────────────────────
  if (mode === 'lateral') {
    const zones: { pos: TaskPosition; x0: number; x1: number }[] = [
      { pos: 'left',   x0: 0,        x1: w * 0.33 },
      { pos: 'center', x0: w * 0.33, x1: w * 0.66 },
      { pos: 'right',  x0: w * 0.66, x1: w },
    ]

    for (const z of zones) {
      const isTarget = z.pos === targetPosition

      // 背景填色
      ctx.fillStyle = isTarget ? ZONE_FILL[z.pos] : 'rgba(0, 0, 0, 0.08)'
      ctx.fillRect(z.x0, 0, z.x1 - z.x0, h)

      // 目標區邊框
      if (isTarget) {
        ctx.strokeStyle = ZONE_STROKE[z.pos]
        ctx.lineWidth = 4
        ctx.strokeRect(z.x0 + 2, 2, z.x1 - z.x0 - 4, h - 4)
      }

      // 區域文字
      const fontSize = Math.max(24, Math.round(h * 0.1))
      ctx.font = `bold ${fontSize}px -apple-system, "Microsoft JhengHei", sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = isTarget ? ZONE_STROKE[z.pos] : 'rgba(255,255,255,0.45)'
      ctx.shadowColor = 'rgba(0,0,0,0.7)'
      ctx.shadowBlur = 6
      ctx.fillText(ZONE_LABELS[z.pos], (z.x0 + z.x1) / 2, Math.round(h * 0.13))
      ctx.shadowBlur = 0
    }

    // 虛線分隔
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([8, 6])
    for (const x of [w * 0.33, w * 0.66]) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  // ── Near-reach 模式：目標圓圈 ──────────────────────────────────
  if (mode === 'near-reach') {
    const cx = w * 0.5
    const cy = h * 0.62
    const r  = Math.min(w, h) * 0.22

    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = ZONE_FILL.center
    ctx.fill()
    ctx.strokeStyle = ZONE_STROKE.center
    ctx.lineWidth = 3
    ctx.stroke()

    ctx.font = `bold ${Math.round(r * 0.38)}px -apple-system, "Microsoft JhengHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = ZONE_STROKE.center
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = 5
    ctx.fillText('目標區', cx, cy + r * 0.15)
    ctx.shadowBlur = 0
  }

  // ── 手部骨架 ────────────────────────────────────────────────────
  for (const hand of results.landmarks) {
    // 連線
    ctx.strokeStyle = 'rgba(0, 220, 120, 0.85)'
    ctx.lineWidth = 2.5
    for (const [a, b] of HAND_CONNECTIONS) {
      const lmA = hand[a] as NormalizedLandmark
      const lmB = hand[b] as NormalizedLandmark
      ctx.beginPath()
      ctx.moveTo(lmX(lmA.x), lmY(lmA.y))
      ctx.lineTo(lmX(lmB.x), lmY(lmB.y))
      ctx.stroke()
    }

    // 關鍵點圓點
    for (const lm of hand as NormalizedLandmark[]) {
      ctx.fillStyle = '#00DC78'
      ctx.beginPath()
      ctx.arc(lmX(lm.x), lmY(lm.y), 4, 0, Math.PI * 2)
      ctx.fill()
    }

    // 手腕高亮 (landmark 0)
    const wrist = hand[0] as NormalizedLandmark
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.arc(lmX(wrist.x), lmY(wrist.y), 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#00DC78'
    ctx.lineWidth = 2.5
    ctx.stroke()
  }

  // ── 持握進度條（底部） ──────────────────────────────────────────
  if (zoneEnteredAt !== null) {
    const elapsed  = performance.now() - zoneEnteredAt
    const progress = Math.min(elapsed / holdDurationMs, 1)
    const barH     = Math.max(14, Math.round(h * 0.028))
    const color    = ZONE_STROKE[targetPosition]

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.fillRect(0, h - barH, w, barH)

    // 進度
    ctx.fillStyle = color
    ctx.fillRect(0, h - barH, w * progress, barH)

    // 文字
    const textSize = Math.max(11, Math.round(barH * 0.72))
    ctx.font = `bold ${textSize}px -apple-system, "Microsoft JhengHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText('保持在目標區域...', w / 2, h - Math.round(barH * 0.12))
  }
}

// ════════════════════════════════════════════════════════════════════
// drawTouchCollectOverlay — 碰點收集遊戲 AR 疊層
// ════════════════════════════════════════════════════════════════════

export interface DrawTcOverlayOptions {
  dots:              TcDot[]
  targetIndex:       number
  radiusPx:          number         // at canvas.width = 640 reference
  holdProgress:      number         // 0-1, progress arc around target
  /** 1 = full time remaining, 0 = time up, -1 = no limit */
  timeLimitProgress: number
  isMirrored:        boolean
  results:           HandLandmarkerResult | null
}

export function drawTouchCollectOverlay(
  canvas: HTMLCanvasElement,
  opts:   DrawTcOverlayOptions,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { width: w, height: h } = canvas
  const {
    dots, targetIndex, radiusPx, holdProgress,
    timeLimitProgress, isMirrored, results,
  } = opts

  ctx.clearRect(0, 0, w, h)

  const r   = radiusPx * (w / 640)
  const lmX = (x: number) => isMirrored ? (1 - x) * w : x * w
  const lmY = (y: number) => y * h
  const now = performance.now()

  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'

  dots.forEach((dot, i) => {
    const cx       = dot.nx * w
    const cy       = dot.ny * h
    const isTarget = i === targetIndex && !dot.collected

    if (dot.collected) {
      // ── Collected: faded green ✓ ────────────────────────────────
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(34, 197, 94, 0.12)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.35)'
      ctx.lineWidth   = 2
      ctx.stroke()

      ctx.font      = `bold ${Math.round(r * 1.05)}px -apple-system, sans-serif`
      ctx.fillStyle = 'rgba(34, 197, 94, 0.65)'
      ctx.fillText('✓', cx, cy)

    } else if (isTarget) {
      // ── Active target: pulsing colored dot ─────────────────────
      const pulse = 0.07 * Math.sin(now / 380)
      const rr    = r * (1 + pulse)

      ctx.beginPath()
      ctx.arc(cx, cy, rr + 14, 0, Math.PI * 2)
      ctx.fillStyle = dot.color.light
      ctx.fill()

      ctx.beginPath()
      ctx.arc(cx, cy, rr, 0, Math.PI * 2)
      ctx.fillStyle   = dot.color.fill
      ctx.fill()
      ctx.strokeStyle = dot.color.stroke
      ctx.lineWidth   = 3
      ctx.stroke()

      ctx.font        = `bold ${Math.round(rr * 0.72)}px -apple-system, "Microsoft JhengHei", sans-serif`
      ctx.fillStyle   = '#FFFFFF'
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur  = 5
      ctx.fillText(String(i + 1), cx, cy)
      ctx.shadowBlur  = 0

      if (holdProgress > 0.02) {
        ctx.beginPath()
        ctx.arc(cx, cy, rr + 8, -Math.PI / 2, -Math.PI / 2 + holdProgress * Math.PI * 2)
        ctx.strokeStyle = '#FFFFFF'
        ctx.lineWidth   = 5
        ctx.lineCap     = 'round'
        ctx.stroke()
        ctx.lineCap     = 'butt'
      }

      if (timeLimitProgress >= 0) {
        const isLow = timeLimitProgress < 0.3
        ctx.beginPath()
        ctx.arc(cx, cy, rr + 18, -Math.PI / 2, -Math.PI / 2 + timeLimitProgress * Math.PI * 2)
        ctx.strokeStyle = isLow ? 'rgba(239, 68, 68, 0.85)' : 'rgba(255, 255, 255, 0.45)'
        ctx.lineWidth   = isLow ? 4 : 2.5
        ctx.stroke()
      }

    } else {
      // ── Pending dot: grey ───────────────────────────────────────
      const rSmall = r * 0.82
      ctx.beginPath()
      ctx.arc(cx, cy, rSmall, 0, Math.PI * 2)
      ctx.fillStyle   = 'rgba(156, 163, 175, 0.18)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(156, 163, 175, 0.45)'
      ctx.lineWidth   = 1.5
      ctx.stroke()

      ctx.font      = `bold ${Math.round(rSmall * 0.65)}px -apple-system, sans-serif`
      ctx.fillStyle = 'rgba(156, 163, 175, 0.65)'
      ctx.fillText(String(i + 1), cx, cy)
    }
  })

  // ── Hand skeleton ────────────────────────────────────────────────
  if (results && results.landmarks.length > 0) {
    for (const hand of results.landmarks) {
      ctx.strokeStyle = 'rgba(0, 220, 120, 0.82)'
      ctx.lineWidth   = 2
      for (const [a, b] of HAND_CONNECTIONS) {
        const lmA = hand[a] as NormalizedLandmark
        const lmB = hand[b] as NormalizedLandmark
        ctx.beginPath()
        ctx.moveTo(lmX(lmA.x), lmY(lmA.y))
        ctx.lineTo(lmX(lmB.x), lmY(lmB.y))
        ctx.stroke()
      }
      for (const lm of hand as NormalizedLandmark[]) {
        ctx.fillStyle = '#00DC78'
        ctx.beginPath()
        ctx.arc(lmX(lm.x), lmY(lm.y), 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
      const wrist     = hand[0] as NormalizedLandmark
      ctx.fillStyle   = '#FFFFFF'
      ctx.beginPath()
      ctx.arc(lmX(wrist.x), lmY(wrist.y), 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#00DC78'
      ctx.lineWidth   = 2.5
      ctx.stroke()
    }
  }

  ctx.textBaseline = 'alphabetic'
  ctx.shadowBlur   = 0
  ctx.lineCap      = 'butt'
}
