'use client'

import { useEffect, useRef, useState } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'

export interface PinchPointer {
  detected: boolean
  x: number
  y: number
  pinching: boolean
}

interface Options {
  landmarker: HandLandmarker | null
  videoRef: React.RefObject<HTMLVideoElement>
  isActive: boolean
  isMirrored: boolean
}

const EMPTY_POINT: PinchPointer = { detected: false, x: 0.5, y: 0.5, pinching: false }

export function usePinchPointer({ landmarker, videoRef, isActive, isMirrored }: Options) {
  const [point, setPoint] = useState<PinchPointer>(EMPTY_POINT)
  const lastRef = useRef<PinchPointer>(EMPTY_POINT)

  useEffect(() => {
    if (!isActive || !landmarker) {
      lastRef.current = EMPTY_POINT
      setPoint(EMPTY_POINT)
      return
    }

    let raf = 0
    let lastDetectionAt = 0

    const loop = () => {
      const video = videoRef.current
      const now = performance.now()
      if (!video || video.readyState < 2 || now - lastDetectionAt < 33) {
        raf = requestAnimationFrame(loop)
        return
      }
      lastDetectionAt = now

      try {
        const result = landmarker.detectForVideo(video, now)
        if (!result.landmarks.length) {
          if (lastRef.current.detected) {
            lastRef.current = EMPTY_POINT
            setPoint(EMPTY_POINT)
          }
        } else {
          const landmarks = result.landmarks[0]
          const indexTip = landmarks[8]
          const thumbTip = landmarks[4]
          const wrist = landmarks[0]
          const middleBase = landmarks[9]
          const handSize = Math.hypot(wrist.x - middleBase.x, wrist.y - middleBase.y) || 0.0001
          const next: PinchPointer = {
            detected: true,
            x: Math.min(1, Math.max(0, isMirrored ? 1 - indexTip.x : indexTip.x)),
            y: Math.min(1, Math.max(0, indexTip.y)),
            pinching: Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y) / handSize < 0.5,
          }
          const previous = lastRef.current
          if (
            !previous.detected ||
            previous.pinching !== next.pinching ||
            Math.abs(previous.x - next.x) > 0.004 ||
            Math.abs(previous.y - next.y) > 0.004
          ) {
            lastRef.current = next
            setPoint(next)
          }
        }
      } catch {
        // A transient MediaPipe frame error should not interrupt the game.
      }
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [isActive, isMirrored, landmarker, videoRef])

  return point
}
