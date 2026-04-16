'use client'

import { useEffect, useRef, useState } from 'react'
import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { WtPath } from '@/lib/wipeTraceConstants'
import { drawWipeTraceOverlay } from '@/lib/drawUtils'

interface UseTraceDetectorOptions {
  landmarker:   HandLandmarker | null
  videoRef:     React.RefObject<HTMLVideoElement>
  canvasRef:    React.RefObject<HTMLCanvasElement>
  path:         WtPath
  tolerancePx:  number
  timeLimitMs:  number
  isActive:     boolean
  isMirrored:   boolean
  /** 每次有新路徑點被擦過時呼叫，用於同步 React HUD 狀態（非關鍵路徑） */
  onProgress:   (newProgress: number) => void
  onComplete:   () => void
  onTimeout:    () => void
}

/**
 * useTraceDetector
 * RAF 迴圈：每幀偵測手腕位置，依序命中路徑點（waypoints）後呼叫 onProgress/onComplete。
 * 倒數至 0 時呼叫 onTimeout。
 * 仿照 useTouchDetector 的穩定 callback ref 模式。
 */
export function useTraceDetector({
  landmarker,
  videoRef,
  canvasRef,
  path,
  tolerancePx,
  timeLimitMs,
  isActive,
  isMirrored,
  onProgress,
  onComplete,
  onTimeout,
}: UseTraceDetectorOptions) {
  const rafRef            = useRef<number | null>(null)
  const progressRef       = useRef(0)
  const roundStartRef     = useRef(performance.now())
  const hasCompletedRef   = useRef(false)
  const lastTimestampRef  = useRef(-1)

  // Stable callback refs — 避免 RAF 因 callback identity 改變而重啟
  const onProgressRef = useRef(onProgress)
  const onCompleteRef = useRef(onComplete)
  const onTimeoutRef  = useRef(onTimeout)
  onProgressRef.current = onProgress
  onCompleteRef.current = onComplete
  onTimeoutRef.current  = onTimeout

  const [handDetected,  setHandDetected]  = useState(false)
  const [isOnPath,      setIsOnPath]      = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(timeLimitMs)

  // ── 每次路徑切換時重置 ─────────────────────────────────────────
  useEffect(() => {
    progressRef.current     = 0
    hasCompletedRef.current = false
    roundStartRef.current   = performance.now()
    lastTimestampRef.current = -1
    setHandDetected(false)
    setIsOnPath(false)
    setTimeRemaining(timeLimitMs)
  // path.id 變更代表新回合開始
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path.id, timeLimitMs])

  // ── 主要 RAF 偵測迴圈 ──────────────────────────────────────────
  useEffect(() => {
    if (!isActive || !landmarker) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const canvas = canvasRef.current
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    const { waypoints } = path
    const total = waypoints.length

    function loop() {
      const video  = videoRef.current
      const canvas = canvasRef.current

      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      // Sync canvas 解析度
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width  = video.videoWidth  || 640
        canvas.height = video.videoHeight || 480
      }

      const now = performance.now()

      // 跳過重複 timestamp（MediaPipe 要求）
      if (now === lastTimestampRef.current) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }
      lastTimestampRef.current = now

      // ── 計算剩餘時間 ──────────────────────────────────────────
      const elapsed   = now - roundStartRef.current
      const remaining = Math.max(0, timeLimitMs - elapsed)
      setTimeRemaining(remaining)

      if (remaining <= 0 && !hasCompletedRef.current) {
        hasCompletedRef.current = true
        drawWipeTraceOverlay(canvas, {
          path, progress: progressRef.current,
          tolerancePx, isOnPath: false, isMirrored,
          results: null, timeRemaining: 0, timeLimitMs,
        })
        onTimeoutRef.current()
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      // ── 手部偵測 ──────────────────────────────────────────────
      let results
      try {
        results = landmarker!.detectForVideo(video, now)
      } catch {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      let currentIsOnPath = false

      if (results.landmarks.length > 0) {
        const wrist  = results.landmarks[0][0] as NormalizedLandmark
        const wristNx = isMirrored ? 1 - wrist.x : wrist.x
        const wristPx = wristNx * canvas.width
        const wristPy = wrist.y * canvas.height

        setHandDetected(true)

        const scaledTol = tolerancePx * (canvas.width / 640)

        // ── 依序命中路徑點（while 迴圈，只能順序推進） ──────────
        let changed = false
        while (progressRef.current < total && !hasCompletedRef.current) {
          const wp  = waypoints[progressRef.current]
          const tx  = wp.x * canvas.width
          const ty  = wp.y * canvas.height
          const dx  = wristPx - tx
          const dy  = wristPy - ty
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < scaledTol) {
            progressRef.current++
            changed = true

            if (progressRef.current >= total) {
              // 路徑全部完成
              hasCompletedRef.current = true
              drawWipeTraceOverlay(canvas, {
                path, progress: progressRef.current,
                tolerancePx, isOnPath: true, isMirrored,
                results, timeRemaining: remaining, timeLimitMs,
              })
              onProgressRef.current(progressRef.current)
              onCompleteRef.current()
              rafRef.current = requestAnimationFrame(loop)
              return
            }
          } else {
            break  // 必須依序命中，遇到未命中即停止
          }
        }

        if (changed) onProgressRef.current(progressRef.current)

        // isOnPath：手腕在當前目標的 2x 容差範圍內
        if (progressRef.current < total) {
          const wp  = waypoints[progressRef.current]
          const tx  = wp.x * canvas.width
          const ty  = wp.y * canvas.height
          const dx  = wristPx - tx
          const dy  = wristPy - ty
          currentIsOnPath = Math.sqrt(dx * dx + dy * dy) < scaledTol * 2
        }
        setIsOnPath(currentIsOnPath)

      } else {
        setHandDetected(false)
        setIsOnPath(false)
      }

      // ── 繪製疊層 ──────────────────────────────────────────────
      drawWipeTraceOverlay(canvas, {
        path,
        progress:      progressRef.current,
        tolerancePx,
        isOnPath:      currentIsOnPath,
        isMirrored,
        results,
        timeRemaining: remaining,
        timeLimitMs,
      })

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  // onProgress/onComplete/onTimeout 透過 ref 處理，排除在 deps 外
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, landmarker, videoRef, canvasRef, path, tolerancePx, timeLimitMs, isMirrored])

  return { handDetected, isOnPath, timeRemaining }
}
