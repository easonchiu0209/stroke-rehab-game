'use client'

import { useRef, useEffect } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { useCamera } from '@/hooks/useCamera'
import { useZoneDetector } from '@/hooks/useZoneDetector'
import type { TaskPosition, GameMode } from '@/types/game'

interface CameraViewProps {
  landmarker:     HandLandmarker | null
  targetPosition: TaskPosition
  mode:           GameMode
  /** true = 遊戲 'waiting' 階段，啟動偵測 */
  isActive:       boolean
  onSuccess:      () => void
}

export function CameraView({
  landmarker,
  targetPosition,
  mode,
  isActive,
  onSuccess,
}: CameraViewProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { isReady, error, startCamera, stopCamera, isMirrored, switchCamera, currentFacing, isSwitching } = useCamera(videoRef)

  const { handDetected, holdProgress } = useZoneDetector({
    landmarker,
    videoRef,
    canvasRef,
    targetPosition,
    mode,
    isActive: isActive && isReady && landmarker !== null,
    isMirrored,
    onSuccess,
  })

  // 復健遊戲需要前置鏡頭（self-monitoring），明確指定 'user'
  useEffect(() => {
    startCamera('user')
    return () => stopCamera()
  }, [startCamera, stopCamera])

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden bg-gray-900 shadow-xl"
      style={{ aspectRatio: '4/3', maxHeight: '52vh' }}
    >
      {/* 鏡頭畫面 — 前置鏡頭才做水平翻轉 */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        style={isMirrored ? { transform: 'scaleX(-1)' } : undefined}
      />

      {/*
        AR 疊層 canvas — 不套 CSS 翻轉
        drawAROverlay 內部已根據 isMirrored 翻轉 landmark x 座標，
        使骨架與（鏡射後的）視頻人物對齊
      */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* 載入中 */}
      {!isReady && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/85 gap-3">
          <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-white text-lg font-semibold">開啟鏡頭中...</p>
        </div>
      )}

      {/* 鏡頭錯誤 */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 p-6 gap-4">
          <div className="text-5xl">📷</div>
          <p className="text-white text-center text-base leading-relaxed whitespace-pre-line">
            {error.message}
          </p>
        </div>
      )}

      {/* 找不到手的提示 */}
      {isReady && !handDetected && landmarker && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
          <div className="bg-black/65 text-white px-5 py-2.5 rounded-full text-base font-semibold">
            🖐 請將手放入鏡頭範圍
          </div>
        </div>
      )}

      {/* 持握進度提示（canvas 已畫底部進度條，這裡加頂部文字提示） */}
      {holdProgress > 0.05 && holdProgress < 1 && (
        <div className="absolute top-3 left-3 right-3 flex flex-col gap-1 pointer-events-none">
          <div className="bg-black/40 rounded-full overflow-hidden h-3">
            <div
              className="h-3 rounded-full bg-green-400 transition-none"
              style={{ width: `${holdProgress * 100}%` }}
            />
          </div>
          <p className="text-white text-sm text-center font-semibold drop-shadow">
            保持不動 {Math.round(holdProgress * 100)}%
          </p>
        </div>
      )}

      {/* AR 狀態角標 */}
      {isReady && landmarker && (
        <div className="absolute top-3 right-3 pointer-events-none">
          <span className="bg-green-500/80 text-white text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">
            🎯 AR 偵測中
          </span>
        </div>
      )}

      {/* 前後鏡頭切換按鈕 */}
      {(isReady || isSwitching) && (
        <button
          onClick={switchCamera}
          disabled={isSwitching}
          className="
            absolute bottom-3 right-3
            bg-black/50 backdrop-blur-sm text-white
            w-11 h-11 rounded-full
            flex items-center justify-center
            text-xl
            hover:bg-black/70 active:scale-90
            transition-all duration-150
            disabled:opacity-50
          "
          title={currentFacing === 'environment' ? '切換至前置鏡頭' : '切換至後置鏡頭'}
        >
          {isSwitching ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
          ) : (
            '🔄'
          )}
        </button>
      )}
    </div>
  )
}
