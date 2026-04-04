'use client'

import { useState, useEffect } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'

// Module-level singleton — 跨 re-render 與頁面切換共用同一實例
let landmarkerInstance: HandLandmarker | null = null
let initPromise: Promise<HandLandmarker> | null = null

async function initHandLandmarker(): Promise<HandLandmarker> {
  if (landmarkerInstance) return landmarkerInstance
  if (initPromise) return initPromise

  initPromise = (async () => {
    // 動態 import 避免 Next.js SSR 問題
    const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    )
    landmarkerInstance = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    })
    return landmarkerInstance
  })()

  return initPromise
}

export function useHandLandmarker() {
  const [landmarker, setLandmarker] = useState<HandLandmarker | null>(null)
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    initHandLandmarker()
      .then((lm) => {
        if (!cancelled) { setLandmarker(lm); setIsLoading(false) }
      })
      .catch((err) => {
        if (!cancelled) {
          initPromise = null
          setError('AI 模型載入失敗，請確認網路連線後重新整理頁面。')
          setIsLoading(false)
        }
        console.error('HandLandmarker init error:', err)
      })

    return () => { cancelled = true }
  }, [])

  const retry = () => {
    initPromise = null
    landmarkerInstance = null
    setLandmarker(null)
    setError(null)
    setIsLoading(true)
    initHandLandmarker()
      .then((lm) => { setLandmarker(lm); setIsLoading(false) })
      .catch(() => {
        initPromise = null
        setError('AI 模型載入失敗，請確認網路連線後重新整理頁面。')
        setIsLoading(false)
      })
  }

  return { landmarker, isLoading, error, retry }
}
