'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { useCamera } from '@/hooks/useCamera'
import { useTraceDetector } from '@/hooks/useTraceDetector'
import {
  WT_LEVEL_CONFIGS,
  WT_PATHS,
  selectPathsForSession,
  type WtDifficulty,
  type WtPath,
  type WtLevelConfig,
  type WtRoundResult,
} from '@/lib/wipeTraceConstants'
import type { HandLandmarker } from '@mediapipe/tasks-vision'

// ── Types ─────────────────────────────────────────────────────────

type Phase = 'config' | 'playing' | 'results'

// ── PlayingView — 獨立元件，管理鏡頭生命週期 ──────────────────────

interface PlayingViewProps {
  config:              WtLevelConfig
  currentPath:         WtPath
  roundIndex:          number
  totalRounds:         number
  progress:            number
  landmarker:          HandLandmarker | null
  isLandmarkerLoading: boolean
  landmarkerError:     string | null
  onProgress:          (p: number) => void
  onComplete:          () => void
  onTimeout:           () => void
  onBack:              () => void
}

function PlayingView({
  config,
  currentPath,
  roundIndex,
  totalRounds,
  progress,
  landmarker,
  isLandmarkerLoading,
  landmarkerError,
  onProgress,
  onComplete,
  onTimeout,
  onBack,
}: PlayingViewProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const {
    isReady, error: cameraError, startCamera, stopCamera,
    isMirrored, switchCamera, currentFacing, isSwitching,
  } = useCamera(videoRef)

  const { handDetected, isOnPath, timeRemaining } = useTraceDetector({
    landmarker,
    videoRef,
    canvasRef,
    path:         currentPath,
    tolerancePx:  config.tolerancePx,
    timeLimitMs:  config.timeLimitMs,
    isActive:     isReady && landmarker !== null && !isLandmarkerLoading && !landmarkerError,
    isMirrored,
    onProgress,
    onComplete,
    onTimeout,
  })

  // 開啟鏡頭（mount 時），關閉（unmount 時）
  // 復健遊戲需要前置鏡頭（self-monitoring），明確指定 'user'
  useEffect(() => {
    startCamera('user')
    return () => stopCamera()
  }, [startCamera, stopCamera])

  // 經過時間顯示
  const [elapsedMs, setElapsedMs] = useState(0)
  const gameStartRef = useRef(performance.now())
  useEffect(() => {
    gameStartRef.current = performance.now()
    setElapsedMs(0)
  }, [currentPath.id])
  useEffect(() => {
    const id = setInterval(() => setElapsedMs(performance.now() - gameStartRef.current), 200)
    return () => clearInterval(id)
  }, [currentPath.id])

  const elapsedSec = Math.floor(elapsedMs / 1000)
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
  const ss = String(elapsedSec % 60).padStart(2, '0')

  const progressPct = Math.round((progress / currentPath.waypoints.length) * 100)
  const isLoading   = !isReady || isLandmarkerLoading

  return (
    <div className="min-h-screen flex flex-col bg-gray-900 select-none">

      {/* ── HUD 上方 ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        {/* 計時器 */}
        <div className="text-white font-mono text-xl font-bold min-w-[72px]">
          ⏱ {mm}:{ss}
        </div>

        {/* 回合 + 路徑名稱 */}
        <div className="text-center">
          <div className="text-white text-sm font-bold">
            第 {roundIndex + 1} / {totalRounds} 回合
          </div>
          <div className="text-gray-400 text-xs">{currentPath.label}</div>
        </div>

        {/* 進度百分比 */}
        <div className="text-white text-base font-semibold min-w-[56px] text-right">
          {progressPct}%
        </div>
      </header>

      {/* ── 鏡頭 + Canvas ────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          style={isMirrored ? { transform: 'scaleX(-1)' } : undefined}
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {/* 載入中 overlay */}
        {isLoading && !cameraError && !landmarkerError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 gap-3">
            <div className="w-10 h-10 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-white text-lg font-semibold">
              {isLandmarkerLoading ? 'AI 模型載入中...' : '開啟鏡頭中...'}
            </p>
          </div>
        )}

        {/* 錯誤 overlay */}
        {(cameraError || landmarkerError) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 p-6 gap-4">
            <div className="text-5xl">⚠️</div>
            <p className="text-white text-center text-base leading-relaxed">
              {cameraError?.message ?? landmarkerError ?? '手部偵測模型載入失敗，請重新整理頁面。'}
            </p>
            <button
              onClick={onBack}
              className="bg-orange-500 text-white px-6 py-3 rounded-xl font-bold text-base"
            >
              返回設定
            </button>
          </div>
        )}

        {/* 無手提示 */}
        {isReady && !handDetected && landmarker && !isLoading && (
          <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none">
            <div className="bg-black/65 text-white px-5 py-2.5 rounded-full text-base font-semibold">
              🖐 請將手放入鏡頭範圍
            </div>
          </div>
        )}

        {/* isOnPath 偏離提示 */}
        {isReady && handDetected && !isOnPath && progress < currentPath.waypoints.length && !isLoading && (
          <div className="absolute top-16 left-0 right-0 flex justify-center pointer-events-none">
            <div className="bg-red-500/80 text-white px-4 py-1.5 rounded-full text-sm font-semibold">
              移近路徑點 →
            </div>
          </div>
        )}

        {/* 時間警告 */}
        {timeRemaining < 5000 && timeRemaining > 0 && (
          <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none">
            <div className="bg-red-500/90 text-white px-5 py-2 rounded-full text-lg font-bold animate-pulse">
              ⏰ {Math.ceil(timeRemaining / 1000)} 秒
            </div>
          </div>
        )}

        {/* AR 偵測徽章 */}
        {isReady && landmarker && (
          <div className="absolute top-3 right-3 pointer-events-none">
            <span className="bg-orange-500/80 text-white text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">
              🧹 AR 偵測中
            </span>
          </div>
        )}

        {/* 切換鏡頭按鈕 */}
        {(isReady || isSwitching) && (
          <button
            onClick={switchCamera}
            disabled={isSwitching}
            className="
              absolute bottom-4 right-4
              bg-black/50 backdrop-blur-sm text-white
              w-12 h-12 rounded-full
              flex items-center justify-center text-xl
              hover:bg-black/70 active:scale-90
              transition-all duration-150
              disabled:opacity-50
            "
            title={currentFacing === 'environment' ? '切換至前置鏡頭' : '切換至後置鏡頭'}
          >
            {isSwitching
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
              : '🔄'}
          </button>
        )}
      </div>

      {/* ── HUD 下方 ─────────────────────────────────────────────── */}
      <div className="bg-gray-800 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <button
          onClick={onBack}
          className="text-gray-400 text-sm font-medium hover:text-white transition-colors"
        >
          ← 離開
        </button>
        <div className={`text-sm font-semibold transition-colors ${isOnPath ? 'text-green-400' : 'text-gray-400'}`}>
          {isOnPath ? '繼續沿著路徑移動 ✓' : `沿路徑擦拭，容差 ${config.tolerancePx}px`}
        </div>
        <div className="text-gray-500 text-xs">{config.label}</div>
      </div>
    </div>
  )
}

// ── Main Page Component ───────────────────────────────────────────

export default function WipeTracePage() {
  const router = useRouter()

  const { landmarker, isLoading: isLandmarkerLoading, error: landmarkerError } = useHandLandmarker()

  const [phase,        setPhase]        = useState<Phase>('config')
  const [difficulty,   setDifficulty]   = useState<WtDifficulty>('easy')
  const [roundResults, setRoundResults] = useState<WtRoundResult[]>([])
  const [sessionPaths, setSessionPaths] = useState<WtPath[]>([])
  const [currentRound, setCurrentRound] = useState(0)
  const [progress,     setProgress]     = useState(0)
  const [totalTimeMs,  setTotalTimeMs]  = useState(0)

  const gameStartTimeRef  = useRef(0)
  const roundStartTimeRef = useRef(0)
  // progressRef mirrors `progress` state so callbacks can read current value without stale closure
  const progressRef = useRef(0)

  const config      = WT_LEVEL_CONFIGS[difficulty]
  const currentPath = sessionPaths[currentRound] ?? WT_PATHS['horizontal']

  // ── 開始遊戲 ──────────────────────────────────────────────────
  function handleStart() {
    const paths = selectPathsForSession(config)
    const now   = performance.now()
    setSessionPaths(paths)
    setCurrentRound(0)
    setProgress(0)
    setRoundResults([])
    setTotalTimeMs(0)
    gameStartTimeRef.current  = now
    roundStartTimeRef.current = now
    setPhase('playing')
  }

  // ── 進度更新（由 useTraceDetector 呼叫，用於 HUD） ────────────
  const handleProgress = useCallback((p: number) => {
    setProgress(p)
    progressRef.current = p
  }, [])

  // ── 回合完成（成功） ──────────────────────────────────────────
  const handleComplete = useCallback(() => {
    const now      = performance.now()
    const timeUsed = now - roundStartTimeRef.current
    const path     = sessionPaths[currentRound] ?? WT_PATHS['horizontal']

    const result: WtRoundResult = {
      pathId:         path.id,
      pathLabel:      path.label,
      completionRate: 1.0,
      timeUsedMs:     timeUsed,
      completed:      true,
    }
    setRoundResults((prev) => [...prev, result])
    progressRef.current = 0
    setProgress(0)

    if (currentRound >= config.totalRounds - 1) {
      setTotalTimeMs(now - gameStartTimeRef.current)
      setPhase('results')
    } else {
      setCurrentRound((r) => r + 1)
      roundStartTimeRef.current = now
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRound, config.totalRounds, sessionPaths])

  // ── 回合超時（失敗） ──────────────────────────────────────────
  const handleTimeout = useCallback(() => {
    const now            = performance.now()
    const path           = sessionPaths[currentRound] ?? WT_PATHS['horizontal']
    const completionRate = progressRef.current / (path.waypoints.length || 20)

    const result: WtRoundResult = {
      pathId:         path.id,
      pathLabel:      path.label,
      completionRate,
      timeUsedMs:     config.timeLimitMs,
      completed:      false,
    }
    setRoundResults((prev) => [...prev, result])
    progressRef.current = 0
    setProgress(0)

    if (currentRound >= config.totalRounds - 1) {
      setTotalTimeMs(now - gameStartTimeRef.current)
      setPhase('results')
    } else {
      setCurrentRound((r) => r + 1)
      roundStartTimeRef.current = now
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRound, config.totalRounds, config.timeLimitMs, sessionPaths])

  // ── 路由 ──────────────────────────────────────────────────────
  function handleBack() { setPhase('config') }
  function handleRestart() {
    setPhase('config')
    setRoundResults([])
    setSessionPaths([])
    setCurrentRound(0)
    setProgress(0)
  }

  // ════════════════════════════════════════════════════════════════
  // Phase: CONFIG
  // ════════════════════════════════════════════════════════════════
  if (phase === 'config') {
    return (
      <main className="min-h-screen flex flex-col items-center px-5 py-10 gap-7 bg-gradient-to-b from-orange-50 to-gray-50">

        {/* 返回首頁 */}
        <div className="w-full max-w-xl">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 text-orange-700 text-base font-semibold hover:text-orange-900 transition-colors"
          >
            ← 返回首頁
          </button>
        </div>

        {/* 標題 */}
        <div className="text-center">
          <div className="text-6xl mb-3 leading-none">🧹</div>
          <h1 className="text-3xl font-extrabold text-orange-900">擦拭軌跡</h1>
          <p className="text-gray-500 mt-1.5 text-base">
            持續性動作控制訓練 · Level 3
          </p>
        </div>

        {/* 難度選擇 */}
        <div className="w-full max-w-xl">
          <h2 className="text-xl font-semibold text-gray-700 mb-3 text-center">選擇難度</h2>
          <div className="flex flex-col gap-3">
            {(['easy', 'medium', 'hard'] as WtDifficulty[]).map((d) => {
              const c          = WT_LEVEL_CONFIGS[d]
              const isSelected = difficulty === d
              return (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`
                    flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all duration-150
                    ${isSelected
                      ? 'border-orange-500 bg-orange-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/40'
                    }
                  `}
                >
                  <span className="text-4xl leading-none">{c.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-lg font-bold text-gray-900">{c.label}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.levelBadge}`}>
                        {c.totalRounds} 回合
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{c.description}</p>
                  </div>
                  {isSelected && (
                    <span className="text-orange-500 text-xl flex-shrink-0">✓</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* 操作說明 */}
        <div className="w-full max-w-xl bg-orange-50 rounded-2xl border border-orange-200 p-4">
          <h3 className="text-base font-semibold text-orange-800 mb-2">📋 操作說明</h3>
          <ul className="text-sm text-orange-700 space-y-1.5">
            <li>• 個案面向鏡頭，手臂可自由移動</li>
            <li>• 畫面出現路徑後，從箭頭起點開始移動手腕</li>
            <li>• 沿著路徑依序擦過每個亮點，將路徑擦乾淨</li>
            <li>• 手腕（圓圈）變綠表示在路徑上，變紅表示偏離</li>
            <li>• 在 {config.timeLimitMs / 1000} 秒內完成路徑即為成功</li>
          </ul>
        </div>

        {/* AI 模型狀態 */}
        {isLandmarkerLoading && (
          <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
            <span className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin inline-block" />
            AI 手部偵測模型載入中...
          </div>
        )}
        {landmarkerError && (
          <div className="text-red-600 text-sm font-medium">⚠️ AI 模型載入失敗，請重新整理頁面</div>
        )}

        {/* 開始按鈕 */}
        <button
          onClick={handleStart}
          className="
            w-full max-w-sm
            bg-orange-600 text-white
            text-2xl font-bold
            min-h-[80px] rounded-2xl
            shadow-lg shadow-orange-200
            hover:bg-orange-500 active:scale-[0.97]
            transition-all duration-150
          "
        >
          開始訓練 🧹
        </button>
      </main>
    )
  }

  // ════════════════════════════════════════════════════════════════
  // Phase: PLAYING
  // ════════════════════════════════════════════════════════════════
  if (phase === 'playing') {
    return (
      <PlayingView
        config={config}
        currentPath={currentPath}
        roundIndex={currentRound}
        totalRounds={config.totalRounds}
        progress={progress}
        landmarker={landmarker}
        isLandmarkerLoading={isLandmarkerLoading}
        landmarkerError={landmarkerError}
        onProgress={handleProgress}
        onComplete={handleComplete}
        onTimeout={handleTimeout}
        onBack={handleBack}
      />
    )
  }

  // ════════════════════════════════════════════════════════════════
  // Phase: RESULTS
  // ════════════════════════════════════════════════════════════════
  const completedCount = roundResults.filter((r) => r.completed).length
  const avgCompletion  = roundResults.length > 0
    ? roundResults.reduce((s, r) => s + r.completionRate, 0) / roundResults.length
    : 0
  const avgPerRoundMs  = roundResults.length > 0
    ? roundResults.reduce((s, r) => s + r.timeUsedMs, 0) / roundResults.length
    : 0

  const ratingEmoji = completedCount === config.totalRounds ? '🏆'
    : avgCompletion >= 0.75 ? '🌟'
    : avgCompletion >= 0.50 ? '👍'
    : '💪'

  const totalSec = Math.floor(totalTimeMs / 1000)
  const rMm = String(Math.floor(totalSec / 60)).padStart(2, '0')
  const rSs = String(totalSec % 60).padStart(2, '0')

  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-10 gap-6 bg-gradient-to-b from-orange-50 to-gray-50">

      {/* 成果標題 */}
      <div className="text-center">
        <div className="text-6xl mb-2 leading-none">{ratingEmoji}</div>
        <h1 className="text-3xl font-extrabold text-orange-900">訓練完成！</h1>
        <p className="text-gray-500 mt-1 text-base">
          擦拭軌跡 · {config.label}難度
        </p>
      </div>

      {/* 統計卡片 */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <div className="grid grid-cols-2 gap-5">
          <div className="text-center">
            <div className="text-4xl font-extrabold text-orange-600">
              {completedCount}/{config.totalRounds}
            </div>
            <div className="text-sm text-gray-500 mt-1">完成回合</div>
          </div>
          <div className="text-center">
            <div className={`text-4xl font-extrabold ${
              avgCompletion >= 0.80 ? 'text-green-600'
              : avgCompletion >= 0.50 ? 'text-yellow-600'
              : 'text-red-500'
            }`}>
              {Math.round(avgCompletion * 100)}%
            </div>
            <div className="text-sm text-gray-500 mt-1">平均完成率</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-700">{rMm}:{rSs}</div>
            <div className="text-sm text-gray-500 mt-1">總時間</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-700">
              {(avgPerRoundMs / 1000).toFixed(1)}s
            </div>
            <div className="text-sm text-gray-500 mt-1">平均每回合</div>
          </div>
        </div>
      </div>

      {/* 各回合詳情 */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">各回合詳情</h3>
        <div className="flex flex-col gap-2.5">
          {roundResults.map((r, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-gray-500 text-sm w-6 flex-shrink-0">{i + 1}</span>
              <span className="text-gray-700 text-sm font-medium w-16 flex-shrink-0">{r.pathLabel}</span>
              {/* 完成率進度條 */}
              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${r.completed ? 'bg-green-400' : 'bg-orange-400'}`}
                  style={{ width: `${Math.round(r.completionRate * 100)}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-8 text-right">{Math.round(r.completionRate * 100)}%</span>
              <span className="text-xs text-gray-400 w-10 text-right">{(r.timeUsedMs / 1000).toFixed(1)}s</span>
              <span className="text-base flex-shrink-0">{r.completed ? '✅' : '❌'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 臨床建議 */}
      {completedCount < config.totalRounds && (
        <div className="w-full max-w-sm bg-amber-50 rounded-xl border border-amber-200 px-4 py-3">
          <p className="text-sm text-amber-700 font-medium">
            💡 部分回合未完成，可嘗試較低難度或休息後再訓練。
          </p>
        </div>
      )}

      {/* 操作按鈕 */}
      <div className="flex gap-3 w-full max-w-sm">
        <button
          onClick={handleRestart}
          className="
            flex-1 bg-orange-600 text-white
            text-xl font-bold
            min-h-[72px] rounded-2xl
            hover:bg-orange-500 active:scale-[0.97]
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
