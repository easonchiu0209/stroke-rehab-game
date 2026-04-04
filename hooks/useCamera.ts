'use client'

import { useState, useCallback, useRef } from 'react'

export type CameraFacing = 'environment' | 'user'

export type CameraError = {
  type: 'permission_denied' | 'not_found' | 'not_supported' | 'unknown'
  message: string
}

/**
 * useCamera
 * 支援前後鏡頭切換。
 * isMirrored = true 表示使用前置鏡頭，需在繪圖時翻轉 landmark x 座標。
 */
export function useCamera(videoRef: React.RefObject<HTMLVideoElement>) {
  const [isReady,       setIsReady]       = useState(false)
  const [error,         setError]         = useState<CameraError | null>(null)
  const [isMirrored,    setIsMirrored]    = useState(false)
  const [currentFacing, setCurrentFacing] = useState<CameraFacing>('environment')
  const [isSwitching,   setIsSwitching]   = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  const startCamera = useCallback(async (preferFacing: CameraFacing = 'environment') => {
    setIsReady(false)
    setError(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      setError({ type: 'not_supported', message: '您的瀏覽器不支援攝影機，請使用 Chrome 或 Safari。' })
      return
    }

    // 依 preferFacing 決定嘗試順序
    type Attempt = { constraints: MediaStreamConstraints; mirrored: boolean; facing: CameraFacing }
    const attempts: Attempt[] = preferFacing === 'environment'
      ? [
          { constraints: { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' } }, mirrored: false, facing: 'environment' },
          { constraints: { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user'        } }, mirrored: true,  facing: 'user'        },
          { constraints: { video: true },                                                                         mirrored: true,  facing: 'user'        },
        ]
      : [
          { constraints: { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user'        } }, mirrored: true,  facing: 'user'        },
          { constraints: { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' } }, mirrored: false, facing: 'environment' },
          { constraints: { video: true },                                                                         mirrored: true,  facing: 'user'        },
        ]

    let stream: MediaStream | null = null
    let mirrored = false
    let resolvedFacing: CameraFacing = preferFacing

    for (const attempt of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(attempt.constraints)
        mirrored        = attempt.mirrored
        resolvedFacing  = attempt.facing
        break
      } catch {
        // try next
      }
    }

    if (!stream) {
      setError({ type: 'not_found', message: '找不到攝影機裝置，請確認攝影機已連接並允許瀏覽器使用。' })
      return
    }

    streamRef.current = stream
    setIsMirrored(mirrored)
    setCurrentFacing(resolvedFacing)

    if (videoRef.current) {
      videoRef.current.srcObject = stream
      try {
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current!
          video.onloadedmetadata = () => video.play().then(resolve).catch(reject)
          video.onerror = reject
        })
        setIsReady(true)

        stream.getTracks().forEach((track) => {
          track.onended = () => {
            setIsReady(false)
            setError({ type: 'permission_denied', message: '攝影機連線中斷，請重新整理頁面。' })
          }
        })
      } catch {
        setError({ type: 'unknown', message: '攝影機啟動失敗，請重新整理頁面。' })
      }
    }
  }, [videoRef])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setIsReady(false)
  }, [videoRef])

  const switchCamera = useCallback(async () => {
    if (isSwitching) return
    setIsSwitching(true)
    const next: CameraFacing = currentFacing === 'environment' ? 'user' : 'environment'
    stopCamera()
    await startCamera(next)
    setIsSwitching(false)
  }, [currentFacing, isSwitching, startCamera, stopCamera])

  return { isReady, error, startCamera, stopCamera, isMirrored, switchCamera, currentFacing, isSwitching }
}
