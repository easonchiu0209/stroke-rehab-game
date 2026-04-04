'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { useCamera } from '@/hooks/useCamera'
import { useTouchDetector } from '@/hooks/useTouchDetector'
import {
  TC_LEVEL_CONFIGS,
  generateTcDots,
  type TcDifficulty,
  type TcDot,
  type TcLevelConfig,
} from '@/lib/touchCollectConstants'
import type { HandLandmarker } from '@mediapipe/tasks-vision'

// ── Types ─────────────────────────────────────────────────────────

type Phase = 'config' | 'playing' | 'results'

interface DotResult {
  collected: boolean
  timeMs:    number   // time spent on this dot (collected or timed out)
}

// ── PlayingView — isolated component for camera lifecycle ─────────

interface PlayingViewProps {
  config:              TcLevelConfig
  dots:                TcDot[]
  targetIndex:         number
  gameStartTime:       number
  landmarker:          HandLandmarker | null
  isLandmarkerLoading: boolean
  landmarkerError:     string | null
  onCollect:           () => void
  onTimeout:           () => void
  onBack:              () => void
}

function PlayingView({
  config,
  dots,
  targetIndex,
  gameStartTime,
  landmarker,
  isLandmarkerLoading,
  landmarkerError,
  onCollect,
  onTimeout,
  onBack,
}: PlayingViewProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { isReady, error: cameraError, startCamera, stopCamera, isMirrored, switchCamera, currentFacing, isSwitching } = useCamera(videoRef)

  const { holdProgress, handDetected, timeRemaining } = useTouchDetector({
    landmarker,
    videoRef,
    canvasRef,
    dots,
    targetIndex,
    radiusPx:   config.radiusPx,
    holdMs:     config.holdMs,
    timeLimitMs: config.timeLimitMs,
    isActive:   isReady && landmarker !== null && !isLandmarkerLoading && !landmarkerError,
    isMirrored,
    onCollect,
    onTimeout,
  })

  // Start camera on mount, stop on unmount
  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  // Elapsed time display
  const [elapsedMs, setElapsedMs] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsedMs(performance.now() - gameStartTime), 200)
    return () => clearInterval(id)
  }, [gameStartTime])

  const elapsedSec = Math.floor(elapsedMs / 1000)
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
  const ss = String(elapsedSec % 60).padStart(2, '0')
  const timeStr = `${mm}:${ss}`

  const collectedCount = dots.filter((d) => d.collected).length
  const isLoading = !isReady || isLandmarkerLoading

  return (
    <div className="min-h-screen flex flex-col bg-gray-900 select-none">

      {/* ── HUD ────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        {/* Timer */}
        <div className="text-white font-mono text-xl font-bold min-w-[72px]">
          ⏱ {timeStr}
        </div>

        {/* Dot progress indicators */}
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {dots.map((dot, i) => (
            <div
              key={dot.id}
              className={`
                w-3.5 h-3.5 rounded-full border-2 transition-all duration-300
                ${dot.collected
                  ? 'bg-green-400 border-green-400 scale-90'
                  : i === targetIndex
                    ? 'bg-white border-white animate-pulse scale-125'
                    : 'bg-gray-600 border-gray-500'
                }
              `}
            />
          ))}
        </div>

        {/* Count */}
        <div className="text-white text-base font-semibold min-w-[56px] text-right">
          {collectedCount} / {dots.length}
        </div>
      </header>

      {/* ── Camera + Canvas ─────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          style={isMirrored ? { transform: 'scaleX(-1)' } : undefined}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
        />

        {/* Loading overlay */}
        {isLoading && !cameraError && !landmarkerError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 gap-3">
            <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-white text-lg font-semibold">
              {isLandmarkerLoading ? 'AI 模型載入中...' : '開啟鏡頭中...'}
            </p>
          </div>
        )}

        {/* Error overlay */}
        {(cameraError || landmarkerError) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 p-6 gap-4">
            <div className="text-5xl">⚠️</div>
            <p className="text-white text-center text-base leading-relaxed">
              {cameraError?.message ?? landmarkerError ?? '手部偵測模型載入失敗，請重新整理頁面。'}
            </p>
            <button
              onClick={onBack}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-base"
            >
              返回設定
            </button>
          </div>
        )}

        {/* No hand hint */}
        {isReady && !handDetected && landmarker && !isLoading && (
          <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none">
            <div className="bg-black/65 text-white px-5 py-2.5 rounded-full text-base font-semibold">
              🖐 請將手放入鏡頭範圍
            </div>
          </div>
        )}

        {/* Time limit warning */}
        {timeRemaining !== null && timeRemaining < 3500 && timeRemaining > 0 && (
          <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none">
            <div className="bg-red-500/90 text-white px-5 py-2 rounded-full text-lg font-bold animate-pulse">
              ⏰ {Math.ceil(timeRemaining / 1000)} 秒
            </div>
          </div>
        )}

        {/* AR badge */}
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
              absolute bottom-4 right-4
              bg-black/50 backdrop-blur-sm text-white
              w-12 h-12 rounded-full
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

        {/* Current target hint */}
        {isReady && !isLoading && dots[targetIndex] && (
          <div className="absolute top-3 left-3 pointer-events-none">
            <div className="bg-black/50 backdrop-blur-sm text-white px-3 py-1.5 rounded-xl text-sm font-bold">
              目標：第 {targetIndex + 1} 點
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom bar ──────────────────────────────────────────── */}
      <div className="bg-gray-800 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <button
          onClick={onBack}
          className="text-gray-400 text-sm font-medium hover:text-white transition-colors"
        >
          ← 離開
        </button>
        <div className={`text-sm font-semibold transition-colors ${holdProgress > 0.05 ? 'text-green-400' : 'text-gray-400'}`}>
          {holdProgress > 0.05
            ? `保持不動... ${Math.round(holdProgress * 100)}%`
            : config.timeLimitMs
              ? `每點限時 ${config.timeLimitMs / 1000}s`
              : '停留在目標點 1 秒即收集'
          }
        </div>
        <div className="text-gray-500 text-xs">
          {config.label}
        </div>
      </div>
    </div>
  )
}

// ── Main Page Component ───────────────────────────────────────────

export default function TouchCollectPage() {
  const router = useRouter()

  const { landmarker, isLoading: isLandmarkerLoading, error: landmarkerError } = useHandLandmarker()

  const [phase,         setPhase]         = useState<Phase>('config')
  const [difficulty,    setDifficulty]    = useState<TcDifficulty>('easy')
  const [dots,          setDots]          = useState<TcDot[]>([])
  const [targetIndex,   setTargetIndex]   = useState(0)
  const [dotResults,    setDotResults]    = useState<DotResult[]>([])
  const [gameStartTime, setGameStartTime] = useState(0)
  const [dotStartTime,  setDotStartTime]  = useState(0)
  const [totalTimeMs,   setTotalTimeMs]   = useState(0)

  const config = TC_LEVEL_CONFIGS[difficulty]

  // ── Game callbacks ────────────────────────────────────────────────
  const handleCollect = useCallback(() => {
    const now        = performance.now()
    const timeForDot = now - dotStartTime

    setDotResults((prev) => [...prev, { collected: true, timeMs: timeForDot }])
    setDots((prev) => prev.map((d, i) => i === targetIndex ? { ...d, collected: true } : d))

    const isLast = targetIndex >= dots.length - 1
    if (isLast) {
      setTotalTimeMs(now - gameStartTime)
      setPhase('results')
    } else {
      setTargetIndex((prev) => prev + 1)
      setDotStartTime(now)
    }
  }, [targetIndex, dots.length, dotStartTime, gameStartTime])

  const handleTimeout = useCallback(() => {
    const now = performance.now()

    setDotResults((prev) => [
      ...prev,
      { collected: false, timeMs: config.timeLimitMs ?? 0 },
    ])

    const isLast = targetIndex >= dots.length - 1
    if (isLast) {
      setTotalTimeMs(now - gameStartTime)
      setPhase('results')
    } else {
      setTargetIndex((prev) => prev + 1)
      setDotStartTime(now)
    }
  }, [targetIndex, dots.length, config.timeLimitMs, gameStartTime])

  // ── Start game ────────────────────────────────────────────────────
  function handleStart() {
    const newDots = generateTcDots(config.dotCount, config.radiusPx)
    const now     = performance.now()
    setDots(newDots)
    setTargetIndex(0)
    setDotResults([])
    setGameStartTime(now)
    setDotStartTime(now)
    setTotalTimeMs(0)
    setPhase('playing')
  }

  // ── Routing ───────────────────────────────────────────────────────
  function handleBack() {
    setPhase('config')
  }

  function handleRestart() {
    setPhase('config')
  }

  // ═══════════════════════════════════════════════════════════════════
  // Phase: CONFIG
  // ═══════════════════════════════════════════════════════════════════
  if (phase === 'config') {
    return (
      <main className="min-h-screen flex flex-col items-center px-5 py-10 gap-7 bg-gradient-to-b from-blue-50 to-gray-50">

        {/* Back nav */}
        <div className="w-full max-w-xl">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 text-blue-700 text-base font-semibold hover:text-blue-900 transition-colors"
          >
            ← 返回首頁
          </button>
        </div>

        {/* Title */}
        <div className="text-center">
          <div className="text-6xl mb-3 leading-none">🎯</div>
          <h1 className="text-3xl font-extrabold text-blue-900">碰點收集</h1>
          <p className="text-gray-500 mt-1.5 text-base">
            肩關節主動活動度訓練 · Level 1
          </p>
        </div>

        {/* Difficulty selector */}
        <div className="w-full max-w-xl">
          <h2 className="text-xl font-semibold text-gray-700 mb-3 text-center">選擇難度</h2>
          <div className="flex flex-col gap-3">
            {(['easy', 'medium', 'hard'] as TcDifficulty[]).map((d) => {
              const c = TC_LEVEL_CONFIGS[d]
              const isSelected = difficulty === d
              return (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`
                    flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all duration-150
                    ${isSelected
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'
                    }
                  `}
                >
                  <span className="text-4xl leading-none">{c.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-lg font-bold text-gray-900">{c.label}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.levelBadge}`}>
                        {c.dotCount} 點
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{c.description}</p>
                  </div>
                  {isSelected && (
                    <span className="text-blue-500 text-xl flex-shrink-0">✓</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Instructions */}
        <div className="w-full max-w-xl bg-blue-50 rounded-2xl border border-blue-200 p-4">
          <h3 className="text-base font-semibold text-blue-800 mb-2">📋 操作說明</h3>
          <ul className="text-sm text-blue-700 space-y-1.5">
            <li>• 個案面向鏡頭，手臂可自由移動</li>
            <li>• 目標點亮起時，移動手腕到該位置</li>
            <li>• 手腕停留在目標點 {config.holdMs / 1000} 秒即自動收集</li>
            <li>• 依序收集全部 {config.dotCount} 個目標點</li>
          </ul>
        </div>

        {/* AI loading status */}
        {isLandmarkerLoading && (
          <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
            <span className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin inline-block" />
            AI 手部偵測模型載入中...
          </div>
        )}
        {landmarkerError && (
          <div className="text-red-600 text-sm font-medium">⚠️ AI 模型載入失敗，請重新整理頁面</div>
        )}

        {/* Start button */}
        <button
          onClick={handleStart}
          className="
            w-full max-w-sm
            bg-blue-800 text-white
            text-2xl font-bold
            min-h-[80px] rounded-2xl
            shadow-lg shadow-blue-200
            hover:bg-blue-700 active:scale-[0.97]
            transition-all duration-150
            no-select
          "
        >
          開始訓練 🎯
        </button>
      </main>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // Phase: PLAYING
  // ═══════════════════════════════════════════════════════════════════
  if (phase === 'playing') {
    return (
      <PlayingView
        config={config}
        dots={dots}
        targetIndex={targetIndex}
        gameStartTime={gameStartTime}
        landmarker={landmarker}
        isLandmarkerLoading={isLandmarkerLoading}
        landmarkerError={landmarkerError}
        onCollect={handleCollect}
        onTimeout={handleTimeout}
        onBack={handleBack}
      />
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // Phase: RESULTS
  // ═══════════════════════════════════════════════════════════════════
  const successCount = dotResults.filter((r) => r.collected).length
  const failCount    = dotResults.length - successCount
  const accuracy     = dotResults.length > 0
    ? Math.round((successCount / dotResults.length) * 100)
    : 0
  const avgMs = successCount > 0
    ? dotResults.filter((r) => r.collected).reduce((s, r) => s + r.timeMs, 0) / successCount
    : 0

  const totalSec = Math.floor(totalTimeMs / 1000)
  const rMm = String(Math.floor(totalSec / 60)).padStart(2, '0')
  const rSs = String(totalSec % 60).padStart(2, '0')

  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-10 gap-6 bg-gradient-to-b from-blue-50 to-gray-50">

      {/* Result header */}
      <div className="text-center">
        <div className="text-6xl mb-2 leading-none">
          {accuracy >= 80 ? '🎉' : accuracy >= 50 ? '💪' : '🔄'}
        </div>
        <h1 className="text-3xl font-extrabold text-blue-900">訓練完成！</h1>
        <p className="text-gray-500 mt-1 text-base">
          碰點收集 · {config.label}難度
        </p>
      </div>

      {/* Stats grid */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <div className="grid grid-cols-2 gap-5">
          <div className="text-center">
            <div className="text-4xl font-extrabold text-blue-700">
              {successCount}/{dotResults.length}
            </div>
            <div className="text-sm text-gray-500 mt-1">收集成功</div>
          </div>
          <div className="text-center">
            <div className={`text-4xl font-extrabold ${accuracy >= 80 ? 'text-green-600' : accuracy >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
              {accuracy}%
            </div>
            <div className="text-sm text-gray-500 mt-1">成功率</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-700">{rMm}:{rSs}</div>
            <div className="text-sm text-gray-500 mt-1">總時間</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-700">
              {successCount > 0 ? `${(avgMs / 1000).toFixed(1)}s` : '—'}
            </div>
            <div className="text-sm text-gray-500 mt-1">平均每點</div>
          </div>
        </div>
      </div>

      {/* Per-dot breakdown */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">各點詳情</h3>
        <div className="flex flex-wrap gap-2">
          {dotResults.map((r, i) => (
            <div
              key={i}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold
                ${r.collected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}
              `}
            >
              <span>{r.collected ? '✓' : '✗'}</span>
              <span>點 {i + 1}</span>
              <span className="text-xs opacity-60">({(r.timeMs / 1000).toFixed(1)}s)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Clinical note */}
      {failCount > 0 && (
        <div className="w-full max-w-sm bg-amber-50 rounded-xl border border-amber-200 px-4 py-3">
          <p className="text-sm text-amber-700 font-medium">
            💡 {failCount} 個點未完成，可嘗試較低難度或休息後再訓練。
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 w-full max-w-sm">
        <button
          onClick={handleRestart}
          className="
            flex-1 bg-blue-800 text-white
            text-xl font-bold
            min-h-[72px] rounded-2xl
            hover:bg-blue-700 active:scale-[0.97]
            transition-all duration-150
          "
        >
          再玩一次
        </button>
        <button
          onClick={() => router.push('/')}
          className="
            flex-1 bg-gray-100 text-gray-700
            text-xl font-bold
            min-h-[72px] rounded-2xl
            border border-gray-200
            hover:bg-gray-200 active:scale-[0.97]
            transition-all duration-150
          "
        >
          回首頁
        </button>
      </div>
    </main>
  )
}
