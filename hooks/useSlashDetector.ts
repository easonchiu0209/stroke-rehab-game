'use client'

import { useEffect, useRef, useState } from 'react'
import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { recordTrajectory } from '@/lib/saveSession'
import { getCalib, applyCalib } from '@/lib/calibration'

export interface SlashTarget {
  id:          number
  x0:          number    // spawn x, normalized display-space (0=left,1=right)
  y0:          number    // spawn y, normalized (0=top,1=bottom)
  vx:          number    // x-velocity (normalized/sec, positive = right)
  vy:          number    // y-velocity (normalized/sec, positive = down)
  gravity:     number    // downward acceleration (normalized/sec²)
  spawnTime:   number    // performance.now()
  hitRadiusPx: number    // hit radius at 640px reference width
  visualEm:    number    // emoji font-size in px at 640px reference
  type:        'fruit' | 'bomb'
  emoji:       string
}

interface UseSlashDetectorOptions {
  landmarker:  HandLandmarker | null
  videoRef:    React.RefObject<HTMLVideoElement>
  canvasRef:   React.RefObject<HTMLCanvasElement>
  isActive:    boolean
  isMirrored:  boolean
  onHit:       (id: number, type: 'fruit' | 'bomb', reactionMs: number, nx: number, ny: number) => void
  onExpired:   (id: number) => void
}

export function getTargetPos(t: SlashTarget, now: number) {
  const elapsed = (now - t.spawnTime) / 1000
  return {
    nx: t.x0 + t.vx * elapsed,
    ny: t.y0 + t.vy * elapsed + 0.5 * t.gravity * elapsed * elapsed,
  }
}

export function isOffScreen(nx: number, ny: number) {
  return nx < -0.18 || nx > 1.18 || ny < -0.6 || ny > 1.18
}

// ── 純視覺輔助（美術聖經 §7 P1：水果本色噴濺 / 切面裂開視覺）────────────────
// 不影響任何偵測或計分邏輯，只決定畫面怎麼畫。

/** 汁液主題色（聖經 §1.3 汁液參考色）。依 target.id 取固定色調，
 *  讓「目標本體光暈」與 page.tsx 命中噴濺色（用同一個 id 取色）視覺一致。 */
const JUICE_TONES = ['#FB5B5B', '#FF9F43', '#7ED957', '#5B8DEF', '#A66CFF']
export function juiceToneForId(id: number) {
  return JUICE_TONES[Math.floor(id) % JUICE_TONES.length]
}

function shadeColor(hex: string, percent: number) {
  // percent: -1..1，負值變暗、正值變亮
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff
  const t = percent < 0 ? 0 : 255
  const p = Math.abs(percent)
  const nr = Math.round((t - r) * p + r)
  const ng = Math.round((t - g) * p + g)
  const nb = Math.round((t - b) * p + b)
  return `rgb(${nr},${ng},${nb})`
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

/** 出場彈入曲線（聖經 §5.1 juicePopIn，0.32s）：0%→0, 60%→1.15, 80%→0.95, 100%→1 */
function popInScale(ageMs: number) {
  const t = Math.min(1, ageMs / 320)
  if (t < 0.6) return lerp(0, 1.15, t / 0.6)
  if (t < 0.8) return lerp(1.15, 0.95, (t - 0.6) / 0.2)
  return lerp(0.95, 1, (t - 0.8) / 0.2)
}

/** 存活中的目標：落地陰影＋呼吸光暈＋圓潤高光底盤＋emoji（聖經 §2）。 */
function drawJuicyTarget(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  target: SlashTarget,
  dispScale: number,   // 640px 參考寬度換算的顯示縮放
  animScale: number,   // 出場彈入 × 呼吸脈動
  ringAlpha: number,
) {
  const isBomb = target.type === 'bomb'
  const tone   = isBomb ? '#4b4b4b' : juiceToneForId(target.id)
  const r      = target.hitRadiusPx * dispScale
  const fontPx = target.visualEm * dispScale

  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(animScale, animScale)

  // 落地陰影（聖經 §2.1：只往下的柔和陰影）
  ctx.save()
  const shadowGrad = ctx.createRadialGradient(0, r * 0.24, 0, 0, r * 0.24, r * 0.85)
  shadowGrad.addColorStop(0, 'rgba(0,0,0,0.30)')
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.translate(0, r * 0.24)
  ctx.scale(1, 0.5)
  ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2)
  ctx.fillStyle = shadowGrad
  ctx.fill()
  ctx.restore()

  // 呼吸可擊光暈（聖經 §2.3／§5.5：柔和呼吸，≤4% 縮放，不閃爍）
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.22, 0, Math.PI * 2)
  ctx.strokeStyle = isBomb ? `rgba(239,83,80,${ringAlpha})` : `rgba(255,255,255,${ringAlpha})`
  ctx.lineWidth = 6
  ctx.stroke()

  // 圓潤高光底盤（聖經 §2.2：左上白高光的塑膠/軟糖質感）
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.34, r * 0.05, 0, 0, r * 1.02)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.42, tone)
  grad.addColorStop(1, shadeColor(tone, -0.35))
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()

  // 白邊描邊（聖經 §3：雜亂鏡頭背景上的辨識度）
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.stroke()

  // Emoji 本體
  ctx.font = `${fontPx}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(target.emoji, 0, 0)

  ctx.restore()
}

interface HitFlash {
  nx: number; ny: number
  emoji: string
  type: 'fruit' | 'bomb'
  tone: string    // 取自命中當下 juiceToneForId(target.id)，跟目標存活時的底盤色一致
  visualEm: number
  hitRadiusPx: number
  angle: number   // 沿飛行方向的垂直角，讓切面殘影朝向物理上合理的方向
  hitAt: number
}

/** 命中殘影：juiceSquash 擠壓退場（聖經 §5.1）＋水果裂成雙半的切面視覺（聖經 §7 P1）。 */
function drawHitFlash(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  dispScale: number,
  hf: HitFlash,
  now: number,
) {
  const age = (now - hf.hitAt) / 260
  if (age >= 1) return
  const r      = hf.hitRadiusPx * dispScale
  const fontPx = hf.visualEm * dispScale

  let sx: number, sy: number, alpha: number
  if (age < 0.35) {
    const t = age / 0.35
    sx = 1 + 0.25 * t; sy = 1 - 0.25 * t; alpha = 1
  } else {
    const t = (age - 0.35) / 0.65
    sx = 1.25 * (1 - t); sy = 0.75 * (1 - t); alpha = 1 - t
  }

  ctx.save()
  ctx.globalAlpha = Math.max(0, alpha)
  ctx.translate(cx, cy)
  ctx.scale(sx, sy)

  if (hf.type === 'bomb') {
    // 炸彈：煙霧灰，無切面（不是可食用物，避免「切開」的誤導聯想）
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2)
    ctx.fillStyle = '#5b5b5b'
    ctx.fill()
  } else {
    // 水果：本色果肉裂成雙半，沿揮擊方向錯開（聖經 §7 P1 切面/裂開視覺）
    for (const side of [-1, 1]) {
      ctx.save()
      ctx.rotate(hf.angle)
      ctx.translate(side * r * 0.16, 0)
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2)
      const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.24, r * 0.05, 0, 0, r * 0.8)
      grad.addColorStop(0, 'rgba(255,255,255,0.85)')
      grad.addColorStop(0.45, hf.tone)
      grad.addColorStop(1, shadeColor(hf.tone, -0.3))
      ctx.fillStyle = grad
      ctx.fill()
      ctx.restore()
    }
  }

  ctx.globalAlpha = Math.max(0, alpha) * 0.9
  ctx.font = `${fontPx}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(hf.emoji, 0, 0)

  ctx.restore()
}

export function useSlashDetector({
  landmarker, videoRef, canvasRef, isActive, isMirrored, onHit, onExpired,
}: UseSlashDetectorOptions) {
  const [handDetected, setHandDetected] = useState(false)

  const targetsRef    = useRef<SlashTarget[]>([])
  const hitIdsRef     = useRef(new Set<number>())
  const expiredIdsRef = useRef(new Set<number>())
  const onHitRef      = useRef(onHit)
  const onExpiredRef  = useRef(onExpired)
  onHitRef.current    = onHit
  onExpiredRef.current = onExpired

  const rafRef           = useRef<number | null>(null)
  const lastTimestampRef = useRef(-1)
  const trajRef          = useRef<number[][]>([])
  const trajStartRef     = useRef(-1)
  const lastSampleRef    = useRef(-1)
  const hitFlashRef      = useRef<HitFlash[]>([])   // 純視覺：命中殘影（切面/擠壓退場），不影響偵測

  function setTargets(targets: SlashTarget[]) {
    targetsRef.current = targets
    const activeIds = new Set(targets.map(t => t.id))
    hitIdsRef.current.forEach(id  => { if (!activeIds.has(id)) hitIdsRef.current.delete(id) })
    expiredIdsRef.current.forEach(id => { if (!activeIds.has(id)) expiredIdsRef.current.delete(id) })
  }

  useEffect(() => {
    if (!isActive || !landmarker) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const canvas = canvasRef.current
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    hitIdsRef.current.clear()
    expiredIdsRef.current.clear()
    hitFlashRef.current = []
    trajRef.current = []; trajStartRef.current = -1; lastSampleRef.current = -1
    recordTrajectory(trajRef.current)
    const cal = getCalib()

    function loop() {
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width  = video.videoWidth  || 640
        canvas.height = video.videoHeight || 480
      }

      const now = performance.now()
      if (now === lastTimestampRef.current) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }
      lastTimestampRef.current = now

      let results
      try { results = landmarker!.detectForVideo(video, now) } catch {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)

      // ── Draw & expire moving targets ──────────────────────────────
      const scale = canvas.width / 640

      for (const target of targetsRef.current) {
        if (hitIdsRef.current.has(target.id)) continue

        const pos = getTargetPos(target, now)

        if (!expiredIdsRef.current.has(target.id) && isOffScreen(pos.nx, pos.ny)) {
          expiredIdsRef.current.add(target.id)
          onExpiredRef.current(target.id)
          continue
        }

        if (expiredIdsRef.current.has(target.id)) continue

        if (ctx) {
          // Canvas is CSS scaleX(-1) → compensate: draw at (1-nx)*W so screen shows nx
          const cx = (1 - pos.nx) * canvas.width
          const cy = pos.ny * canvas.height

          // 出場彈入（聖經 §5.1 juicePopIn）＋呼吸脈動（聖經 §2.3/§5.5，全目標同步時鐘）
          const spawnAge = now - target.spawnTime
          const popScale = spawnAge >= 320 ? 1 : popInScale(spawnAge)
          const breathe  = 0.5 + 0.5 * Math.sin((now / 1200) * Math.PI * 2)
          const animScale = popScale * (1 + breathe * 0.04)
          const ringAlpha = 0.5 - breathe * 0.35

          drawJuicyTarget(ctx, cx, cy, target, scale, animScale, ringAlpha)
        }
      }

      // 命中殘影：切面擠壓退場（聖經 §5.1 juiceSquash，260ms 後自然消失）
      if (ctx) {
        hitFlashRef.current = hitFlashRef.current.filter(hf => now - hf.hitAt < 260)
        for (const hf of hitFlashRef.current) {
          const cx = (1 - hf.nx) * canvas.width
          const cy = hf.ny * canvas.height
          drawHitFlash(ctx, cx, cy, scale, hf, now)
        }
      }

      // ── Hand detection ────────────────────────────────────────────
      if (!results || results.landmarks.length === 0) {
        setHandDetected(false)
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      const wrist: NormalizedLandmark = results.landmarks[0][0]
      const [wx, wy] = applyCalib(wrist.x, wrist.y, cal)
      const wristNxDisplay = isMirrored ? 1 - wx : wx
      const wristNy        = wy

      setHandDetected(true)

      // 約 10Hz 取樣手部軌跡
      if (trajStartRef.current < 0) trajStartRef.current = now
      if (now - lastSampleRef.current >= 100) {
        lastSampleRef.current = now
        trajRef.current.push([Math.round(now - trajStartRef.current), Math.round(wristNxDisplay * 1000) / 1000, Math.round(wristNy * 1000) / 1000])
      }

      // Draw wrist cursor (raw coords, CSS handles mirror)
      // 聖經 §3：手部游標統一規範＝ 3px solid #FFD600 ＋ 半透明底 ＋ 外光暈
      if (ctx) {
        const cx = wx * canvas.width
        const cy = wy * canvas.height
        ctx.save()
        ctx.shadowColor = 'rgba(255,214,0,0.55)'
        ctx.shadowBlur  = 14 * scale
        ctx.beginPath()
        ctx.arc(cx, cy, 18 * scale, 0, Math.PI * 2)
        ctx.fillStyle   = 'rgba(255,214,0,0.22)'
        ctx.fill()
        ctx.shadowBlur  = 0
        ctx.strokeStyle = '#FFD600'
        ctx.lineWidth   = 3 * scale
        ctx.stroke()
        ctx.restore()
      }

      // ── Hit detection（判定邏輯完全不變，僅額外記錄一筆純視覺用的命中殘影）────
      for (const target of targetsRef.current) {
        if (hitIdsRef.current.has(target.id) || expiredIdsRef.current.has(target.id)) continue
        const pos    = getTargetPos(target, now)
        const scaleR = target.hitRadiusPx * scale
        const dx     = (wristNxDisplay - pos.nx) * canvas.width
        const dy     = (wristNy        - pos.ny) * canvas.height
        if (Math.sqrt(dx * dx + dy * dy) < scaleR) {
          hitIdsRef.current.add(target.id)
          hitFlashRef.current.push({
            nx: pos.nx, ny: pos.ny, emoji: target.emoji, type: target.type,
            tone: juiceToneForId(target.id),
            visualEm: target.visualEm, hitRadiusPx: target.hitRadiusPx,
            angle: Math.atan2(target.vy, target.vx) + Math.PI / 2,
            hitAt: now,
          })
          onHitRef.current(target.id, target.type, Math.round(now - target.spawnTime), pos.nx, pos.ny)
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, landmarker, videoRef, canvasRef])

  return { handDetected, setTargets, getTrajectory: () => trajRef.current }
}
