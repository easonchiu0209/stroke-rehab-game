'use client'

import { useEffect, useRef, useState } from 'react'
import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { TcDot } from '@/lib/touchCollectConstants'
import { drawTouchCollectOverlay } from '@/lib/drawUtils'

interface UseTouchDetectorOptions {
  landmarker:    HandLandmarker | null
  videoRef:      React.RefObject<HTMLVideoElement>
  canvasRef:     React.RefObject<HTMLCanvasElement>
  dots:          TcDot[]
  targetIndex:   number
  radiusPx:      number
  holdMs:        number
  timeLimitMs:   number | null
  isActive:      boolean
  isMirrored:    boolean
  onCollect:     () => void
  onTimeout:     () => void
}

/**
 * useTouchDetector
 * RAF 迴圈：每幀偵測手腕是否在目標圓點內，停留 holdMs 後呼叫 onCollect。
 * 若 timeLimitMs 倒數至 0 則呼叫 onTimeout。
 */
export function useTouchDetector({
  landmarker,
  videoRef,
  canvasRef,
  dots,
  targetIndex,
  radiusPx,
  holdMs,
  timeLimitMs,
  isActive,
  isMirrored,
  onCollect,
  onTimeout,
}: UseTouchDetectorOptions) {
  const rafRef           = useRef<number | null>(null)
  const holdStartRef     = useRef<number | null>(null)
  const hasTriggeredRef  = useRef(false)
  const lastTimestampRef = useRef(-1)
  const dotStartTimeRef  = useRef<number | null>(null)

  // Stable callback refs — avoids restarting the RAF when only the callbacks change
  const onCollectRef = useRef(onCollect)
  const onTimeoutRef = useRef(onTimeout)
  onCollectRef.current = onCollect
  onTimeoutRef.current = onTimeout

  const [holdProgress,  setHoldProgress]  = useState(0)
  const [handDetected,  setHandDetected]  = useState(false)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)

  // ── Reset when targetIndex changes (new dot becomes active) ──────
  useEffect(() => {
    holdStartRef.current    = null
    hasTriggeredRef.current = false
    dotStartTimeRef.current = performance.now()
    setHoldProgress(0)
    setHandDetected(false)
    setTimeRemaining(timeLimitMs)
  }, [targetIndex, timeLimitMs])

  // ── Main RAF detection loop ───────────────────────────────────────
  useEffect(() => {
    if (!isActive || !landmarker) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx?.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    hasTriggeredRef.current = false

    function loop() {
      const video  = videoRef.current
      const canvas = canvasRef.current

      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      // Sync canvas resolution to video stream
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

      // ── Run hand detection ──────────────────────────────────────
      let results
      try {
        results = landmarker!.detectForVideo(video, now)
      } catch {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      // ── Compute time-limit progress ─────────────────────────────
      let timeLimitProgress = -1
      if (timeLimitMs !== null && dotStartTimeRef.current !== null) {
        const elapsed   = now - dotStartTimeRef.current
        const remaining = Math.max(0, timeLimitMs - elapsed)
        timeLimitProgress = remaining / timeLimitMs
        setTimeRemaining(remaining)

        if (remaining <= 0 && !hasTriggeredRef.current) {
          hasTriggeredRef.current = true
          // Draw final state before calling timeout
          drawTouchCollectOverlay(canvas, {
            dots, targetIndex, radiusPx,
            holdProgress: 0, timeLimitProgress: 0,
            isMirrored, results,
          })
          onTimeoutRef.current()
          // Let RAF keep running so canvas stays updated after phase change
          rafRef.current = requestAnimationFrame(loop)
          return
        }
      }

      // ── Wrist in-dot detection ──────────────────────────────────
      let currentHoldProgress = 0

      if (results.landmarks.length > 0) {
        const wrist  = results.landmarks[0][0] as NormalizedLandmark
        const wristNx = isMirrored ? 1 - wrist.x : wrist.x
        const wristNy = wrist.y

        setHandDetected(true)

        const targetDot = dots[targetIndex]
        if (targetDot && !targetDot.collected && !hasTriggeredRef.current) {
          const scaleR = radiusPx * (canvas.width / 640)
          const dx     = (wristNx - targetDot.nx) * canvas.width
          const dy     = (wristNy - targetDot.ny) * canvas.height
          const dist   = Math.sqrt(dx * dx + dy * dy)

          if (dist < scaleR) {
            if (holdStartRef.current === null) holdStartRef.current = now
            currentHoldProgress = Math.min((now - holdStartRef.current) / holdMs, 1)
            setHoldProgress(currentHoldProgress)

            if (currentHoldProgress >= 1) {
              hasTriggeredRef.current = true
              drawTouchCollectOverlay(canvas, {
                dots, targetIndex, radiusPx,
                holdProgress: 1, timeLimitProgress,
                isMirrored, results,
              })
              onCollectRef.current()
              rafRef.current = requestAnimationFrame(loop)
              return
            }
          } else {
            holdStartRef.current = null
            setHoldProgress(0)
          }
        }
      } else {
        setHandDetected(false)
        holdStartRef.current = null
        setHoldProgress(0)
      }

      // ── Draw overlay ────────────────────────────────────────────
      drawTouchCollectOverlay(canvas, {
        dots,
        targetIndex,
        radiusPx,
        holdProgress: currentHoldProgress,
        timeLimitProgress,
        isMirrored,
        results,
      })

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  // Note: onCollect/onTimeout are handled via refs, so excluded from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, landmarker, videoRef, canvasRef, dots, targetIndex, radiusPx, holdMs, timeLimitMs, isMirrored])

  return { holdProgress, handDetected, timeRemaining }
}
