'use client'

// 手臂抬升偵測（骨科 O1 爬牆挑戰用）：以 MediaPipe Pose 估算「肩屈曲/外展角度」。
// 定義：同側 肩→肘 向量 與 肩→髖（軀幹向下）向量 的夾角。
//   0° = 手臂自然下垂、~90° = 平舉、~160°+ = 高舉過頭。
// 兩側同時計算，取可見度達標中角度較大的一側（讓個案自由用患側或健側）。
// ⚠️ webcam 2D 為估算值，非醫療量測 — UI 必須標示。
// 註：本遊戲的姿勢即為訓練目標本身，不另掛 usePoseMonitor（避免同一 Pose 單例被兩個迴圈驅動）。

import { useEffect, useRef, useState } from 'react'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'

interface Options {
  landmarker: PoseLandmarker | null
  videoRef:   React.RefObject<HTMLVideoElement>
  isActive:   boolean
}

interface Pt { x: number; y: number; visibility?: number }

function angleAt(shoulder: Pt, elbow: Pt, hip: Pt): number {
  const ax = elbow.x - shoulder.x, ay = elbow.y - shoulder.y
  const bx = hip.x - shoulder.x,  by = hip.y - shoulder.y
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by)
  if (la < 1e-6 || lb < 1e-6) return 0
  const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))
  return (Math.acos(cos) * 180) / Math.PI
}

export function useArmRaiseDetector({ landmarker, videoRef, isActive }: Options) {
  const [bodyDetected, setBodyDetected] = useState(false)
  const [angle, setAngle] = useState(0)          // EMA 平滑後角度（deg）
  const angleRef   = useRef(0)
  const rafRef     = useRef<number | null>(null)
  const lastNowRef = useRef(-1)
  const lastUiRef  = useRef(0)

  useEffect(() => {
    if (!isActive || !landmarker) return
    angleRef.current = 0

    function loop() {
      const video = videoRef.current
      if (!video || video.readyState < 2) { rafRef.current = requestAnimationFrame(loop); return }
      const now = performance.now()
      if (now === lastNowRef.current) { rafRef.current = requestAnimationFrame(loop); return }
      lastNowRef.current = now

      let results
      try { results = landmarker!.detectForVideo(video, now) } catch { rafRef.current = requestAnimationFrame(loop); return }

      let best = -1
      if (results?.landmarks?.length) {
        const lm = results.landmarks[0]
        // 左側：肩11 肘13 髖23；右側：肩12 肘14 髖24
        for (const [s, e, h] of [[11, 13, 23], [12, 14, 24]] as const) {
          const vis = ((lm[s]?.visibility ?? 0) + (lm[e]?.visibility ?? 0)) / 2
          if (vis > 0.5 && lm[s] && lm[e] && lm[h]) {
            best = Math.max(best, angleAt(lm[s], lm[e], lm[h]))
          }
        }
      }

      if (best >= 0) {
        setBodyDetected(true)
        angleRef.current += (best - angleRef.current) * 0.3   // EMA 平滑
      } else {
        setBodyDetected(false)
      }

      // UI 更新節流 ~12Hz（避免 React 每幀重繪）
      if (now - lastUiRef.current > 80) {
        lastUiRef.current = now
        setAngle(Math.round(angleRef.current))
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, landmarker, videoRef])

  return { bodyDetected, angle, getAngle: () => angleRef.current }
}
