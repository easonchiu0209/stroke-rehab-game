'use client'

// 踏步偵測（N1 節奏踏步用）：MediaPipe Pose 追蹤左右膝抬起/放下循環。
// 原理：各腿以「髖-膝垂直距離」為基準（前幾秒自動校正），
//   距離縮短到閾值以下 = 抬腿、回復 = 放下（遲滯避免抖動誤觸），一個循環 = 一步。
// 坐姿與站姿皆適用（皆為大腿抬起使膝靠近髖的高度）。

import { useEffect, useRef, useState } from 'react'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'

interface Options {
  landmarker: PoseLandmarker | null
  videoRef:   React.RefObject<HTMLVideoElement>
  isActive:   boolean
  liftRatio:  number                       // 抬腿判定：gap < baseline × liftRatio（越小越嚴格）
  onStep:     (side: 'L' | 'R', tMs: number) => void
}

interface LegState { baseline: number; samples: number[]; lifted: boolean }

export function useStepDetector({ landmarker, videoRef, isActive, liftRatio, onStep }: Options) {
  const [bodyDetected, setBodyDetected] = useState(false)
  const rafRef     = useRef<number | null>(null)
  const lastNowRef = useRef(-1)
  const startRef   = useRef(-1)
  const onStepRef  = useRef(onStep); onStepRef.current = onStep
  const legsRef    = useRef<{ L: LegState; R: LegState }>({
    L: { baseline: -1, samples: [], lifted: false },
    R: { baseline: -1, samples: [], lifted: false },
  })

  useEffect(() => {
    if (!isActive || !landmarker) return
    startRef.current = -1
    legsRef.current = {
      L: { baseline: -1, samples: [], lifted: false },
      R: { baseline: -1, samples: [], lifted: false },
    }

    function feedLeg(side: 'L' | 'R', gap: number, t: number) {
      const leg = legsRef.current[side]
      // 校正期：收 15 個樣本取中位數當基準（自然坐/站姿的髖膝距離）
      if (leg.baseline < 0) {
        leg.samples.push(gap)
        if (leg.samples.length >= 15) {
          const sorted = leg.samples.slice().sort((a, b) => a - b)
          leg.baseline = sorted[Math.floor(sorted.length / 2)]
        }
        return
      }
      if (leg.baseline < 0.03) return   // 基準異常（鏡頭太近/角度怪）不判定
      if (!leg.lifted && gap < leg.baseline * liftRatio) {
        leg.lifted = true
        onStepRef.current(side, t)
      } else if (leg.lifted && gap > leg.baseline * 0.88) {
        leg.lifted = false
      }
    }

    function loop() {
      const video = videoRef.current
      if (!video || video.readyState < 2) { rafRef.current = requestAnimationFrame(loop); return }
      const now = performance.now()
      if (now === lastNowRef.current) { rafRef.current = requestAnimationFrame(loop); return }
      lastNowRef.current = now

      let results
      try { results = landmarker!.detectForVideo(video, now) } catch { rafRef.current = requestAnimationFrame(loop); return }

      let ok = false
      if (results?.landmarks?.length) {
        const lm = results.landmarks[0]
        if (startRef.current < 0) startRef.current = now
        const t = now - startRef.current
        // 左：髖23 膝25；右：髖24 膝26（gap = 膝 y - 髖 y，抬腿時變小）
        for (const [side, h, k] of [['L', 23, 25], ['R', 24, 26]] as const) {
          const vis = ((lm[h]?.visibility ?? 0) + (lm[k]?.visibility ?? 0)) / 2
          if (vis > 0.5 && lm[h] && lm[k]) {
            ok = true
            feedLeg(side, Math.max(0, lm[k].y - lm[h].y), t)
          }
        }
      }
      setBodyDetected(ok)
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, landmarker, videoRef, liftRatio])

  return { bodyDetected }
}
