'use client'

import { useState, useEffect } from 'react'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'

// Module-level singleton — 跨 re-render 與頁面切換共用同一實例
let poseInstance: PoseLandmarker | null = null
let initPromise: Promise<PoseLandmarker> | null = null

async function initPoseLandmarker(): Promise<PoseLandmarker> {
  if (poseInstance) return poseInstance
  if (initPromise) return initPromise

  initPromise = (async () => {
    const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    )
    poseInstance = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.6,
      minPosePresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    })
    return poseInstance
  })()

  return initPromise
}

export function usePoseLandmarker() {
  const [landmarker, setLandmarker] = useState<PoseLandmarker | null>(null)
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    initPoseLandmarker()
      .then((lm) => { if (!cancelled) { setLandmarker(lm); setIsLoading(false) } })
      .catch((err) => {
        if (!cancelled) {
          initPromise = null
          setError('AI 模型載入失敗，請確認網路連線後重新整理頁面。')
          setIsLoading(false)
        }
        console.error('PoseLandmarker init error:', err)
      })

    return () => { cancelled = true }
  }, [])

  const retry = () => {
    initPromise = null
    poseInstance = null
    setLandmarker(null)
    setError(null)
    setIsLoading(true)
    initPoseLandmarker()
      .then((lm) => { setLandmarker(lm); setIsLoading(false) })
      .catch(() => {
        initPromise = null
        setError('AI 模型載入失敗，請確認網路連線後重新整理頁面。')
        setIsLoading(false)
      })
  }

  return { landmarker, isLoading, error, retry }
}
