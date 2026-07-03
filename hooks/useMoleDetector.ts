'use client'

import { useEffect, useRef, useState } from 'react'
import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { recordTrajectory } from '@/lib/saveSession'
import { getCalib, applyCalib } from '@/lib/calibration'

export interface MoleTarget {
  id:        number
  nx:        number   // display-space normalised (0 = left, 1 = right of screen)
  ny:        number   // normalised (0 = top, 1 = bottom)
  spawnTime: number   // performance.now() when spawned, for reaction-time calc
}

interface UseMoleDetectorOptions {
  landmarker:   HandLandmarker | null
  videoRef:     React.RefObject<HTMLVideoElement>
  canvasRef:    React.RefObject<HTMLCanvasElement>
  isActive:     boolean
  /** Base hit radius in px at 640-wide reference resolution */
  hitRadiusPx:  number
  isMirrored:   boolean
  onHit:        (moleId: number, reactionMs: number) => void
}

/**
 * useMoleDetector
 * RAF 迴圈：每幀偵測手腕是否進入目標圓內，觸碰即呼叫 onHit。
 * 透過 setMoles() 更新當前活躍的目標清單。
 */
export function useMoleDetector({
  landmarker,
  videoRef,
  canvasRef,
  isActive,
  hitRadiusPx,
  isMirrored,
  onHit,
}: UseMoleDetectorOptions) {
  const [handDetected, setHandDetected] = useState(false)
  const [handNxDisplay, setHandNxDisplay] = useState(0.5)
  const [handNy, setHandNy] = useState(0.5)

  // Internal moles ref — updated by setMoles() without restarting RAF
  const molesRef    = useRef<MoleTarget[]>([])
  const hitIdsRef   = useRef(new Set<number>())
  const onHitRef    = useRef(onHit)
  onHitRef.current  = onHit

  const rafRef           = useRef<number | null>(null)
  const lastTimestampRef = useRef(-1)
  const trajRef          = useRef<number[][]>([])
  const trajStartRef     = useRef(-1)
  const lastSampleRef    = useRef(-1)

  // Expose a setter so the page can update active moles
  function setMoles(moles: MoleTarget[]) {
    molesRef.current = moles
    // Prune hitIds that are no longer active
    const activeIds = new Set(moles.map((m) => m.id))
    hitIdsRef.current.forEach((id) => {
      if (!activeIds.has(id)) hitIdsRef.current.delete(id)
    })
  }

  // ── Main RAF detection loop ─────────────────────────────────────────────
  useEffect(() => {
    if (!isActive || !landmarker) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const canvas = canvasRef.current
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    hitIdsRef.current.clear()
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
      try {
        results = landmarker!.detectForVideo(video, now)
      } catch {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (results.landmarks.length === 0) {
        setHandDetected(false)
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      const wrist = results.landmarks[0][0] as NormalizedLandmark
      // 套用鏡頭校正（原始座標）後再轉 display-space
      const [wx, wy] = applyCalib(wrist.x, wrist.y, cal)
      const wristNxDisplay = isMirrored ? 1 - wx : wx
      const wristNy        = wy

      setHandDetected(true)
      setHandNxDisplay(wristNxDisplay)
      setHandNy(wristNy)

      // 約 10Hz 取樣手部軌跡
      if (trajStartRef.current < 0) trajStartRef.current = now
      if (now - lastSampleRef.current >= 100) {
        lastSampleRef.current = now
        trajRef.current.push([Math.round(now - trajStartRef.current), Math.round(wristNxDisplay * 1000) / 1000, Math.round(wristNy * 1000) / 1000])
      }

      // Draw wrist indicator on canvas (canvas is CSS-mirrored, so use raw coords)
      if (ctx) {
        const cx = wx * canvas.width
        const cy = wy * canvas.height
        ctx.beginPath()
        ctx.arc(cx, cy, 18, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,214,0,0.35)'
        ctx.fill()
        ctx.strokeStyle = '#FFD600'
        ctx.lineWidth   = 3
        ctx.stroke()
      }

      // ── Hit detection ──────────────────────────────────────────────
      const scaleR = hitRadiusPx * (canvas.width / 640)
      for (const mole of molesRef.current) {
        if (hitIdsRef.current.has(mole.id)) continue
        const dx   = (wristNxDisplay - mole.nx) * canvas.width
        const dy   = (wristNy        - mole.ny) * canvas.height
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < scaleR) {
          hitIdsRef.current.add(mole.id)
          onHitRef.current(mole.id, Math.round(now - mole.spawnTime))
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }

  // isMirrored and hitRadiusPx are stable per game session, no need in deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, landmarker, videoRef, canvasRef])

  return { handDetected, handNxDisplay, handNy, setMoles, getTrajectory: () => trajRef.current }
}
