'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { TaskPosition, GameMode } from '@/types/game'
import { drawAROverlay } from '@/lib/drawUtils'

export type HandZone = TaskPosition | 'none'

/** 手停留在目標區 1.5 秒後自動判定成功 */
const HOLD_DURATION_MS = 1500

interface UseZoneDetectorOptions {
  landmarker:     HandLandmarker | null
  videoRef:       React.RefObject<HTMLVideoElement>
  canvasRef:      React.RefObject<HTMLCanvasElement>
  targetPosition: TaskPosition
  mode:           GameMode
  isActive:       boolean
  isMirrored:     boolean
  onSuccess:      () => void
}

export function useZoneDetector({
  landmarker,
  videoRef,
  canvasRef,
  targetPosition,
  mode,
  isActive,
  isMirrored,
  onSuccess,
}: UseZoneDetectorOptions) {
  const rafRef          = useRef<number | null>(null)
  const zoneEnteredAtRef = useRef<number | null>(null)
  const hasTriggeredRef = useRef(false)
  const lastTimestampRef = useRef(-1)

  const [currentZone,  setCurrentZone]  = useState<HandZone>('none')
  const [holdProgress, setHoldProgress] = useState(0)
  const [handDetected, setHandDetected] = useState(false)

  /**
   * 根據手腕位置判斷所在區域
   * isMirrored = true 時翻轉 x，使顯示座標與物理方向一致
   */
  const getZone = useCallback(
    (wristX: number, wristY: number): HandZone => {
      const x = isMirrored ? 1 - wristX : wristX

      if (mode === 'near-reach') {
        // 近距離：手在畫面中央區域且靠近桌面（y > 0.2）
        if (wristY > 0.2 && x > 0.15 && x < 0.85) return 'center'
        return 'none'
      }

      // 左右移動：三等分水平分區
      if (x < 0.33) return 'left'
      if (x > 0.66) return 'right'
      return 'center'
    },
    [mode, isMirrored]
  )

  // 每回合目標改變時重置狀態
  useEffect(() => {
    zoneEnteredAtRef.current  = null
    hasTriggeredRef.current   = false
    setHoldProgress(0)
    setCurrentZone('none')
    setHandDetected(false)
  }, [targetPosition])

  useEffect(() => {
    if (!isActive || !landmarker) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      // 清除 canvas
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

      // 同步 canvas 尺寸
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

      // 繪製 AR 疊層
      drawAROverlay(canvas, {
        results,
        targetPosition,
        mode,
        zoneEnteredAt: zoneEnteredAtRef.current,
        holdDurationMs: HOLD_DURATION_MS,
        isMirrored,
      })

      if (results.landmarks.length > 0) {
        const wrist = results.landmarks[0][0] as NormalizedLandmark
        const zone  = getZone(wrist.x, wrist.y)

        setHandDetected(true)
        setCurrentZone(zone)

        if (zone === targetPosition && !hasTriggeredRef.current) {
          if (zoneEnteredAtRef.current === null) {
            zoneEnteredAtRef.current = now
          }
          const progress = Math.min((now - zoneEnteredAtRef.current) / HOLD_DURATION_MS, 1)
          setHoldProgress(progress)

          if (progress >= 1) {
            hasTriggeredRef.current = true
            onSuccess()
          }
        } else if (zone !== targetPosition) {
          zoneEnteredAtRef.current = null
          setHoldProgress(0)
        }
      } else {
        setHandDetected(false)
        setCurrentZone('none')
        zoneEnteredAtRef.current = null
        setHoldProgress(0)
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [isActive, landmarker, videoRef, canvasRef, targetPosition, mode, isMirrored, getZone, onSuccess])

  return { currentZone, holdProgress, handDetected }
}
