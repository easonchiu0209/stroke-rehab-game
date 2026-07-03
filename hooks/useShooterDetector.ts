'use client'

import { useEffect, useRef, useState } from 'react'
import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { recordTrajectory } from '@/lib/saveSession'
import { getCalib, applyCalib } from '@/lib/calibration'

export type FireMode = 'touch' | 'dwell' | 'pinch'

export interface ShooterTarget {
  id:          number
  x0:          number
  y0:          number
  vx:          number   // normalized/sec
  vy:          number   // normalized/sec
  spawnTime:   number
  hitRadiusPx: number   // at 640px reference
  visualEm:    number
  type:        'enemy' | 'mine'
  emoji:       string
}

interface Options {
  landmarker: HandLandmarker | null
  videoRef:   React.RefObject<HTMLVideoElement>
  canvasRef:  React.RefObject<HTMLCanvasElement>
  isActive:   boolean
  isMirrored: boolean
  fireMode:   FireMode
  dwellMs:    number
  onHit:      (id: number, type: 'enemy' | 'mine', reactionMs: number, nx: number, ny: number) => void
  onExpired:  (id: number) => void
}

export function shooterPos(t: ShooterTarget, now: number) {
  const e = (now - t.spawnTime) / 1000
  return { nx: t.x0 + t.vx * e, ny: t.y0 + t.vy * e }
}
function offScreen(nx: number, ny: number) {
  return nx < -0.2 || nx > 1.2 || ny < -0.3 || ny > 1.25
}

export function useShooterDetector({
  landmarker, videoRef, canvasRef, isActive, isMirrored, fireMode, dwellMs, onHit, onExpired,
}: Options) {
  const [handDetected, setHandDetected] = useState(false)

  const targetsRef    = useRef<ShooterTarget[]>([])
  const hitIdsRef     = useRef(new Set<number>())
  const expiredIdsRef = useRef(new Set<number>())
  const dwellRef      = useRef<{ id: number; ms: number }>({ id: -1, ms: 0 })
  const wasPinchRef   = useRef(false)
  const lastNowRef    = useRef(-1)
  const trajRef       = useRef<number[][]>([])
  const trajStartRef  = useRef(-1)
  const lastSampleRef = useRef(-1)
  const onHitRef      = useRef(onHit);     onHitRef.current = onHit
  const onExpRef      = useRef(onExpired); onExpRef.current = onExpired
  const rafRef        = useRef<number | null>(null)

  function setTargets(targets: ShooterTarget[]) {
    targetsRef.current = targets
    const ids = new Set(targets.map(t => t.id))
    hitIdsRef.current.forEach(id => { if (!ids.has(id)) hitIdsRef.current.delete(id) })
    expiredIdsRef.current.forEach(id => { if (!ids.has(id)) expiredIdsRef.current.delete(id) })
  }

  useEffect(() => {
    if (!isActive || !landmarker) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const c = canvasRef.current
      if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
      return
    }
    hitIdsRef.current.clear()
    expiredIdsRef.current.clear()
    dwellRef.current = { id: -1, ms: 0 }
    wasPinchRef.current = false
    trajRef.current = []; trajStartRef.current = -1; lastSampleRef.current = -1
    recordTrajectory(trajRef.current)
    const cal = getCalib()

    function loop() {
      const video = videoRef.current, canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(loop); return }
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480
      }
      const now = performance.now()
      if (now === lastNowRef.current) { rafRef.current = requestAnimationFrame(loop); return }
      const dt = lastNowRef.current < 0 ? 16 : now - lastNowRef.current
      lastNowRef.current = now

      let results
      try { results = landmarker!.detectForVideo(video, now) } catch { rafRef.current = requestAnimationFrame(loop); return }

      const ctx = canvas.getContext('2d')
      const scale = canvas.width / 640
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)

      // ── targets: move, expire, draw ──────────────────────────
      for (const t of targetsRef.current) {
        if (hitIdsRef.current.has(t.id) || expiredIdsRef.current.has(t.id)) continue
        const p = shooterPos(t, now)
        if (offScreen(p.nx, p.ny)) { expiredIdsRef.current.add(t.id); onExpRef.current(t.id); continue }
        if (ctx) {
          const cx = (1 - p.nx) * canvas.width
          const cy = p.ny * canvas.height
          ctx.font = `${t.visualEm * scale}px serif`
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText(t.emoji, cx, cy)
        }
      }

      if (!results || results.landmarks.length === 0) {
        setHandDetected(false)
        dwellRef.current = { id: -1, ms: 0 }
        rafRef.current = requestAnimationFrame(loop); return
      }
      setHandDetected(true)
      const lm = results.landmarks[0]
      const tip: NormalizedLandmark = lm[8]   // index fingertip = aim
      const [tx, ty] = applyCalib(tip.x, tip.y, cal)
      const aimNx = isMirrored ? 1 - tx : tx
      const aimNy = ty

      // 約 10Hz 取樣手部軌跡（給治療師深度分析）
      if (trajStartRef.current < 0) trajStartRef.current = now
      if (now - lastSampleRef.current >= 100) {
        lastSampleRef.current = now
        trajRef.current.push([Math.round(now - trajStartRef.current), Math.round(aimNx * 1000) / 1000, Math.round(aimNy * 1000) / 1000])
      }

      // pinch ratio (thumb tip 4 ↔ index tip 8) normalized by hand size (0↔9)
      const thumb = lm[4], idx = lm[8], wrist = lm[0], midMcp = lm[9]
      const pd = Math.hypot(thumb.x - idx.x, thumb.y - idx.y)
      const hs = Math.hypot(wrist.x - midMcp.x, wrist.y - midMcp.y) || 0.0001
      const isPinch = pd / hs < 0.55

      // find aimed target (nearest within radius)
      let aimed: ShooterTarget | null = null
      let aimedDist = Infinity
      for (const t of targetsRef.current) {
        if (hitIdsRef.current.has(t.id) || expiredIdsRef.current.has(t.id)) continue
        const p = shooterPos(t, now)
        const dx = (aimNx - p.nx) * canvas.width
        const dy = (aimNy - p.ny) * canvas.height
        const d = Math.hypot(dx, dy)
        if (d < t.hitRadiusPx * scale && d < aimedDist) { aimed = t; aimedDist = d }
      }

      const fire = (t: ShooterTarget) => {
        const p = shooterPos(t, now)
        hitIdsRef.current.add(t.id)
        onHitRef.current(t.id, t.type, Math.round(now - t.spawnTime), p.nx, p.ny)
      }

      let dwellFrac = 0
      if (fireMode === 'touch') {
        if (aimed) fire(aimed)
      } else if (fireMode === 'dwell') {
        if (aimed) {
          if (dwellRef.current.id === aimed.id) dwellRef.current.ms += dt
          else dwellRef.current = { id: aimed.id, ms: dt }
          dwellFrac = Math.min(1, dwellRef.current.ms / dwellMs)
          if (dwellRef.current.ms >= dwellMs) { fire(aimed); dwellRef.current = { id: -1, ms: 0 } }
        } else dwellRef.current = { id: -1, ms: 0 }
      } else { // pinch
        if (isPinch && !wasPinchRef.current && aimed) fire(aimed)
      }
      wasPinchRef.current = isPinch

      // ── draw crosshair at aim (raw tip.x; CSS mirrors) ────────
      if (ctx) {
        const cx = tx * canvas.width
        const cy = ty * canvas.height
        const r = 24 * scale
        const charged = fireMode === 'pinch' ? isPinch : dwellFrac > 0
        ctx.strokeStyle = charged ? '#ff5252' : '#46e0ff'
        ctx.lineWidth = 3 * scale
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
        // ticks
        ctx.beginPath()
        ctx.moveTo(cx - r - 6 * scale, cy); ctx.lineTo(cx - r + 6 * scale, cy)
        ctx.moveTo(cx + r - 6 * scale, cy); ctx.lineTo(cx + r + 6 * scale, cy)
        ctx.moveTo(cx, cy - r - 6 * scale); ctx.lineTo(cx, cy - r + 6 * scale)
        ctx.moveTo(cx, cy + r - 6 * scale); ctx.lineTo(cx, cy + r + 6 * scale)
        ctx.stroke()
        ctx.beginPath(); ctx.arc(cx, cy, 2.5 * scale, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle as string; ctx.fill()
        // dwell charge arc
        if (fireMode === 'dwell' && dwellFrac > 0) {
          ctx.beginPath()
          ctx.arc(cx, cy, r + 6 * scale, -Math.PI / 2, -Math.PI / 2 + dwellFrac * Math.PI * 2)
          ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4 * scale; ctx.stroke()
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, landmarker, videoRef, canvasRef, fireMode, dwellMs, isMirrored])

  return { handDetected, setTargets, getTrajectory: () => trajRef.current }
}
