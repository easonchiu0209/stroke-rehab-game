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
          const r  = target.hitRadiusPx * scale

          // Glow ring
          const isHitZone = false
          ctx.beginPath()
          ctx.arc(cx, cy, r, 0, Math.PI * 2)
          ctx.strokeStyle = target.type === 'bomb'
            ? 'rgba(255,80,80,0.5)'
            : 'rgba(255,255,255,0.3)'
          ctx.lineWidth = 2
          ctx.stroke()

          if (!isHitZone) {
            // Emoji
            const fontSize = target.visualEm * scale
            ctx.font = `${fontSize}px serif`
            ctx.textAlign    = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(target.emoji, cx, cy)
          }
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
      if (ctx) {
        const cx = wx * canvas.width
        const cy = wy * canvas.height
        ctx.beginPath()
        ctx.arc(cx, cy, 18 * scale, 0, Math.PI * 2)
        ctx.fillStyle   = 'rgba(255,255,255,0.25)'
        ctx.fill()
        ctx.strokeStyle = '#FFFFFF'
        ctx.lineWidth   = 2.5
        ctx.stroke()
      }

      // ── Hit detection ─────────────────────────────────────────────
      for (const target of targetsRef.current) {
        if (hitIdsRef.current.has(target.id) || expiredIdsRef.current.has(target.id)) continue
        const pos    = getTargetPos(target, now)
        const scaleR = target.hitRadiusPx * scale
        const dx     = (wristNxDisplay - pos.nx) * canvas.width
        const dy     = (wristNy        - pos.ny) * canvas.height
        if (Math.sqrt(dx * dx + dy * dy) < scaleR) {
          hitIdsRef.current.add(target.id)
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
