'use client'

// 坐到站偵測（骨科 O2 用）：MediaPipe Pose 追蹤「髖-膝垂直距離」。
// 坐姿時髖與膝接近同高（gap 小）；站立時髖遠高於膝（gap 大）。
// 開場坐姿校正基準（中位數），gap 超出基準 +0.10（normalized）判定站起、
// 回到基準 +0.05 以下判定坐回（遲滯防抖）。一次完整站起 = 計一次。

import { useEffect, useRef, useState } from 'react'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'

interface Options {
  landmarker: PoseLandmarker | null
  videoRef:   React.RefObject<HTMLVideoElement>
  isActive:   boolean
  onStand:    (tMs: number) => void   // 完成一次站起（達到站立高度）
  onSit:      (tMs: number) => void   // 坐回（可開始下一次）
}

const STAND_DELTA = 0.10
const SIT_DELTA   = 0.05

export function useSitStandDetector({ landmarker, videoRef, isActive, onStand, onSit }: Options) {
  const [bodyDetected, setBodyDetected] = useState(false)
  const [calibrated, setCalibrated] = useState(false)
  const rafRef     = useRef<number | null>(null)
  const lastNowRef = useRef(-1)
  const startRef   = useRef(-1)
  const baseRef    = useRef(-1)
  const samplesRef = useRef<number[]>([])
  const standingRef = useRef(false)
  const onStandRef = useRef(onStand); onStandRef.current = onStand
  const onSitRef   = useRef(onSit);   onSitRef.current = onSit

  useEffect(() => {
    if (!isActive || !landmarker) return
    startRef.current = -1
    baseRef.current = -1
    samplesRef.current = []
    standingRef.current = false
    setCalibrated(false)

    function loop() {
      const video = videoRef.current
      if (!video || video.readyState < 2) { rafRef.current = requestAnimationFrame(loop); return }
      const now = performance.now()
      if (now === lastNowRef.current) { rafRef.current = requestAnimationFrame(loop); return }
      lastNowRef.current = now

      let results
      try { results = landmarker!.detectForVideo(video, now) } catch { rafRef.current = requestAnimationFrame(loop); return }

      let gap = -1
      if (results?.landmarks?.length) {
        const lm = results.landmarks[0]
        const vis = ((lm[23]?.visibility ?? 0) + (lm[24]?.visibility ?? 0) + (lm[25]?.visibility ?? 0) + (lm[26]?.visibility ?? 0)) / 4
        if (vis > 0.5) {
          const hipY = (lm[23].y + lm[24].y) / 2
          const kneeY = (lm[25].y + lm[26].y) / 2
          gap = Math.max(0, kneeY - hipY)   // 站立時大、坐姿時小
        }
      }

      if (gap >= 0) {
        setBodyDetected(true)
        if (startRef.current < 0) startRef.current = now
        const t = now - startRef.current

        if (baseRef.current < 0) {
          // 坐姿校正：收 20 個樣本取中位數
          samplesRef.current.push(gap)
          if (samplesRef.current.length >= 20) {
            const sorted = samplesRef.current.slice().sort((a, b) => a - b)
            baseRef.current = sorted[Math.floor(sorted.length / 2)]
            setCalibrated(true)
          }
        } else {
          const delta = gap - baseRef.current
          if (!standingRef.current && delta > STAND_DELTA) {
            standingRef.current = true
            onStandRef.current(t)
          } else if (standingRef.current && delta < SIT_DELTA) {
            standingRef.current = false
            onSitRef.current(t)
          }
        }
      } else {
        setBodyDetected(false)
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, landmarker, videoRef])

  return { bodyDetected, calibrated }
}
