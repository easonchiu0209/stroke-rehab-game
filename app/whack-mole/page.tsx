'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { useCamera } from '@/hooks/useCamera'
import { useMoleDetector, type MoleTarget } from '@/hooks/useMoleDetector'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { saveGameSession, computeZones } from '@/lib/saveSession'
import { usePoseMonitor } from '@/hooks/usePoseMonitor'
import CompensationHint from '@/components/game/CompensationHint'
import JuiceLayer, { type JuiceHandle } from '@/components/game/JuiceLayer'
import { useFlowDda, useDdaRecommendation } from '@/hooks/useFlowDda'
import { feedbackHit, speak } from '@/lib/feedback'
import { SceneBack, SceneFront } from '@/components/game/GameScene'

// ── Types ──────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard'
type GamePhase  = 'countdown' | 'playing' | 'ended'
type PagePhase  = 'config' | 'playing' | 'results'

interface Cfg {
  label:        string
  sublabel:     string
  hitRadiusPx:  number   // ref radius at 640px width
  displayMs:    number   // ms each mole stays before expiring
  gameSecs:     number
  spawnArea:    { xMin: number; xMax: number; yMin: number; yMax: number }
  badgeColor:   string
}

const CFGS: Record<Difficulty, Cfg> = {
  easy:   { label: 'Level 1', sublabel: '被動輔助期', hitRadiusPx: 75,  displayMs: 4000, gameSecs: 60, spawnArea: { xMin: 0.20, xMax: 0.80, yMin: 0.25, yMax: 0.75 }, badgeColor: 'bg-green-100 text-green-800' },
  medium: { label: 'Level 2', sublabel: '主動輔助期', hitRadiusPx: 55,  displayMs: 2500, gameSecs: 60, spawnArea: { xMin: 0.10, xMax: 0.90, yMin: 0.15, yMax: 0.85 }, badgeColor: 'bg-blue-100 text-blue-800'  },
  hard:   { label: 'Level 3', sublabel: '主動控制期', hitRadiusPx: 38,  displayMs: 1500, gameSecs: 60, spawnArea: { xMin: 0.05, xMax: 0.95, yMin: 0.10, yMax: 0.90 }, badgeColor: 'bg-purple-100 text-purple-800' },
}

interface HitRecord {
  nx:          number   // display-space (mirrored) normalised x
  ny:          number
  reactionMs:  number
  success:     boolean
}

interface GameResults {
  hits:        number
  misses:      number
  hitRecords:  HitRecord[]
  difficulty:  Difficulty
}

// ── PlayingView — isolated component so camera lifecycle is clean ───────────

interface PlayingViewProps {
  cfg:                 Cfg
  difficulty:          Difficulty
  landmarker:          HandLandmarker | null
  isLandmarkerLoading: boolean
  landmarkerError:     string | null
  onGameEnd:           (results: GameResults) => void
  onBack:              () => void
}

function PlayingView({
  cfg,
  difficulty,
  landmarker,
  isLandmarkerLoading,
  landmarkerError,
  onGameEnd,
  onBack,
}: PlayingViewProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const areaRef   = useRef<HTMLDivElement>(null)
  const juiceRef  = useRef<JuiceHandle>(null)

  const { isReady, error: cameraError, startCamera, stopCamera, isMirrored } = useCamera(videoRef)

  // ── Game state ────────────────────────────────────────────────────
  const [gamePhase,   setGamePhase]   = useState<GamePhase>('countdown')
  const [countdown,   setCountdown]   = useState(3)
  const [timeLeft,    setTimeLeft]    = useState(cfg.gameSecs)
  const [hitCount,    setHitCount]    = useState(0)
  const [missCount,   setMissCount]   = useState(0)
  const [moles,       setMolesState]  = useState<(MoleTarget & { expireAt: number; cssRadius: number })[]>([])
  const [hitMoleIds,  setHitMoleIds]  = useState<Set<number>>(new Set())

  // Refs for timer callbacks
  const gamePhaseRef  = useRef<GamePhase>('countdown')
  const hitCountRef   = useRef(0)
  const missCountRef  = useRef(0)
  const hitRecordsRef = useRef<HitRecord[]>([])
  const savedRef      = useRef(false)
  const moleTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const noHandWarnRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [noHandWarn,  setNoHandWarn]  = useState(false)

  useEffect(() => { gamePhaseRef.current = gamePhase }, [gamePhase])

  // 背景 Pose 監測：動作錄製 + 代償偵測（倒數階段收基準線）
  const { hint: poseHint } = usePoseMonitor({
    videoRef, isMirrored,
    active: gamePhase === 'countdown' || gamePhase === 'playing',
  })

  // 場中心流 DDA：滾動命中率調整地鼠存在時間（維持 70–80% 甜蜜區）
  const { reportHit, reportMiss, getFactor } = useFlowDda(gamePhase === 'playing')

  // Camera
  useEffect(() => {
    startCamera('user')
    return () => { stopCamera() }
  }, [startCamera, stopCamera])

  // ── Detection ─────────────────────────────────────────────────────
  const isDetectorActive =
    gamePhase === 'playing' &&
    isReady &&
    landmarker !== null &&
    !isLandmarkerLoading &&
    !landmarkerError

  const handleHit = useCallback((moleId: number, reactionMs: number) => {
    if (gamePhaseRef.current !== 'playing') return

    // Cancel expiry timer
    const t = moleTimersRef.current.get(moleId)
    if (t) { clearTimeout(t); moleTimersRef.current.delete(moleId) }

    feedbackHit()
    reportHit()

    hitCountRef.current += 1
    setHitCount((n) => n + 1)
    setHitMoleIds((prev) => new Set(prev).add(moleId))

    // Read mole position from current state for hit record
    setMolesState((prev) => {
      const m = prev.find((x) => x.id === moleId)
      if (m) {
        hitRecordsRef.current.push({ nx: m.nx, ny: m.ny, reactionMs, success: true })
        juiceRef.current?.burst(m.nx, m.ny)
        juiceRef.current?.floatText(m.nx, m.ny - 0.06, '+10')
        juiceRef.current?.shake(0.4)
      }
      return prev
    })

    // Remove mole after hit animation, then spawn next
    setTimeout(() => {
      setMolesState((prev) => prev.filter((m) => m.id !== moleId))
      setHitMoleIds((prev) => { const s = new Set(prev); s.delete(moleId); return s })
      setTimeout(() => spawnMoleRef.current(), 300)
    }, 280)
  }, [reportHit])

  const { handDetected, handNxDisplay, handNy, setMoles: syncDetector } = useMoleDetector({
    landmarker,
    videoRef,
    canvasRef,
    isActive: isDetectorActive,
    hitRadiusPx: cfg.hitRadiusPx + 20,   // +20px generosity margin
    isMirrored,
    onHit: handleHit,
  })

  // Keep detector in sync with React state
  useEffect(() => {
    syncDetector(moles)
  }, [moles, syncDetector])

  // ── Mole spawning ─────────────────────────────────────────────────
  const spawnMole = useCallback(() => {
    if (gamePhaseRef.current !== 'playing') return
    const area = areaRef.current
    if (!area) return

    const { xMin, xMax, yMin, yMax } = cfg.spawnArea
    const cssR  = cfg.hitRadiusPx * 1.1   // visual radius ≈ hit radius

    const nx = xMin + Math.random() * (xMax - xMin)
    const ny = yMin + Math.random() * (yMax - yMin)
    const id = performance.now() + Math.random() * 100000
    const now = performance.now()

    // 場中 DDA：依滾動命中率調整存在時間（factor >1 = 更難 = 顯示更短）
    const displayMs = Math.round(cfg.displayMs / getFactor())
    const mole = { id, nx, ny, spawnTime: now, expireAt: now + displayMs, cssRadius: cssR }

    setMolesState((prev) => [...prev, mole])

    // Auto-expire
    const timer = setTimeout(() => {
      moleTimersRef.current.delete(id)
      if (gamePhaseRef.current !== 'playing') return
      missCountRef.current += 1
      setMissCount((n) => n + 1)
      reportMiss()
      hitRecordsRef.current.push({ nx, ny, reactionMs: displayMs, success: false })
      setMolesState((prev) => prev.filter((m) => m.id !== id))
      setTimeout(() => spawnMoleRef.current(), 400)
    }, displayMs)

    moleTimersRef.current.set(id, timer)
  }, [cfg, getFactor, reportMiss])

  const spawnMoleRef = useRef(spawnMole)
  useEffect(() => { spawnMoleRef.current = spawnMole }, [spawnMole])

  // ── Countdown 3-2-1 ───────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== 'countdown') return
    if (countdown <= 0) { setGamePhase('playing'); return }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [gamePhase, countdown])

  // ── Game timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== 'playing') return
    if (timeLeft <= 0) { setGamePhase('ended'); return }
    const t = setTimeout(() => setTimeLeft((t) => t - 1), 1000)
    return () => clearTimeout(t)
  }, [gamePhase, timeLeft])

  // Kick off first mole when game starts
  useEffect(() => {
    if (gamePhase !== 'playing') return
    spawnMoleRef.current()
  }, [gamePhase])

  // ── Save results when ended ────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== 'ended' || savedRef.current) return
    savedRef.current = true
    moleTimersRef.current.forEach((t) => clearTimeout(t))
    moleTimersRef.current.clear()
    onGameEnd({
      hits:       hitCountRef.current,
      misses:     missCountRef.current,
      hitRecords: hitRecordsRef.current,
      difficulty,
    })
  }, [gamePhase, difficulty, onGameEnd])

  // ── No-hand warning ───────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== 'playing') return
    if (!handDetected) {
      noHandWarnRef.current = setTimeout(() => setNoHandWarn(true), 3000)
    } else {
      if (noHandWarnRef.current) { clearTimeout(noHandWarnRef.current); noHandWarnRef.current = null }
      setNoHandWarn(false)
    }
    return () => { if (noHandWarnRef.current) clearTimeout(noHandWarnRef.current) }
  }, [gamePhase, handDetected])

  // Camera / model error state
  const hasError    = !!(cameraError || landmarkerError)
  const isLoading   = !isReady || isLandmarkerLoading
  const cssRadiusPx = cfg.hitRadiusPx * 1.1

  return (
    <div className="flex flex-col w-full h-screen bg-gray-900 overflow-hidden select-none">

      {/* ── HUD ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-black/60 text-white shrink-0">
        <div>
          <p className="text-xs opacity-60">分數</p>
          <p className="text-4xl font-black text-yellow-400 leading-none">{hitCount * 10}</p>
        </div>
        <div className="text-center">
          {gamePhase === 'countdown' && (
            <p className="text-6xl font-black">{countdown > 0 ? countdown : '開始！'}</p>
          )}
          {gamePhase === 'playing' && (
            <>
              <p className="text-xs opacity-60">剩餘時間</p>
              <p className={`text-5xl font-black leading-none ${timeLeft <= 10 ? 'text-red-400' : ''}`}>
                {timeLeft}
              </p>
            </>
          )}
          {gamePhase === 'ended' && (
            <p className="text-2xl font-bold text-yellow-400">遊戲結束！</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs opacity-60">打中</p>
          <p className="text-4xl font-black text-green-400 leading-none">{hitCount}</p>
        </div>
      </div>

      {/* ── Game area ────────────────────────────────────────────── */}
      <div ref={areaRef} className="relative flex-1 overflow-hidden bg-black">

        {/* Themed background behind the camera */}
        <SceneBack theme="meadow" />

        {/* Camera feed + canvas overlay */}
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" style={{ transform: isMirrored ? 'scaleX(-1)' : undefined, opacity: 0 }} />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ transform: isMirrored ? 'scaleX(-1)' : undefined }} />

        {/* 代償提醒（聳肩/前傾/側彎） */}
        <CompensationHint hint={poseHint} />

        {/* 命中特效層（粒子/彈跳字/微震） */}
        <JuiceLayer ref={juiceRef} />

        {/* Mole targets */}
        {moles.map((mole) => {
          const isHit = hitMoleIds.has(mole.id)
          return (
            <div
              key={mole.id}
              className="absolute pointer-events-none"
              style={{
                left:      `calc(${mole.nx * 100}% - ${cssRadiusPx}px)`,
                top:       `calc(${mole.ny * 100}% - ${cssRadiusPx}px)`,
                width:     cssRadiusPx * 2,
                height:    cssRadiusPx * 2,
                borderRadius: '50%',
                background: isHit
                  ? 'radial-gradient(circle, #FFD600, #FF6F00)'
                  : 'radial-gradient(circle at 40% 35%, #ffffff, #e8f5e9 40%, #4CAF50 100%)',
                border:    isHit ? '4px solid #FF6F00' : '4px solid #fff',
                boxShadow: isHit
                  ? '0 0 50px rgba(255,214,0,1)'
                  : '0 4px 20px rgba(0,0,0,0.7), 0 0 0 4px rgba(255,255,255,0.3)',
                transform:   isHit ? 'scale(1.6)' : 'scale(1)',
                opacity:     isHit ? 0 : 1,
                transition:  isHit ? 'transform 0.25s ease-out, opacity 0.25s' : 'none',
                animation:   isHit
                  ? 'none'
                  : 'juicePopIn 0.32s cubic-bezier(0.34,1.56,0.64,1) both, molePulse 1.2s ease-in-out 0.35s infinite',
                display:     'flex',
                alignItems:  'center',
                justifyContent: 'center',
                fontSize:    cssRadiusPx * 1.1,
                lineHeight:  1,
              }}
            >
              🐭
            </div>
          )
        })}

        {/* Hand cursor */}
        {handDetected && (
          <div
            className="absolute pointer-events-none"
            style={{
              left:   `calc(${handNxDisplay * 100}% - 26px)`,
              top:    `calc(${handNy * 100}% - 26px)`,
              width:  52,
              height: 52,
              borderRadius:  '50%',
              background:    'rgba(255,214,0,0.2)',
              border:        '3px solid #FFD600',
              boxShadow:     '0 0 18px rgba(255,214,0,0.5)',
            }}
          />
        )}

        {/* Loading / error overlay */}
        {(isLoading || hasError) && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 text-white">
            {hasError ? (
              <>
                <p className="text-4xl">⚠️</p>
                <p className="text-xl font-semibold">{cameraError?.message ?? landmarkerError}</p>
              </>
            ) : (
              <>
                <p className="text-4xl animate-pulse">⏳</p>
                <p className="text-xl">正在載入 AI 模型…</p>
              </>
            )}
          </div>
        )}

        {/* No-hand warning */}
        {noHandWarn && gamePhase === 'playing' && (
          <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-4 text-white">
            <p className="text-5xl">👋</p>
            <p className="text-2xl font-semibold">未偵測到手部</p>
            <p className="text-lg opacity-80">請將手放到鏡頭前方</p>
          </div>
        )}

        {/* Countdown overlay */}
        {gamePhase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            <p className="text-2xl mb-4 opacity-80">準備好了嗎？</p>
            <p className="text-9xl font-black text-yellow-400" style={{ textShadow: '0 0 40px rgba(255,214,0,0.7)' }}>
              {countdown > 0 ? countdown : '開始！'}
            </p>
            <p className="text-lg mt-6 opacity-70">移動手部觸碰目標</p>
          </div>
        )}

        {/* Edge decorations + vignette on top */}
        <SceneFront theme="meadow" />
      </div>

      {/* Pulse keyframe — injected once */}
      <style>{`
        @keyframes molePulse {
          0%, 100% { transform: scale(1); box-shadow: 0 6px 24px rgba(0,0,0,0.6), 0 0 0 0 rgba(255,214,0,0.5); }
          50%       { transform: scale(1.07); box-shadow: 0 6px 24px rgba(0,0,0,0.6), 0 0 0 14px rgba(255,214,0,0); }
        }
      `}</style>
    </div>
  )
}

// ── ConfigView ──────────────────────────────────────────────────────────────

function ConfigView({
  onStart,
  onBack,
  recommended,
}: {
  onStart: (d: Difficulty) => void
  onBack:  () => void
  recommended: Difficulty | null
}) {
  const [selected, setSelected] = useState<Difficulty>('medium')
  const touchedRef = useRef(false)

  // AI 建議難度：使用者尚未手動選擇時自動預選
  useEffect(() => {
    if (recommended && !touchedRef.current) setSelected(recommended)
  }, [recommended])

  const diffOptions: { key: Difficulty; emoji: string; desc: string }[] = [
    { key: 'easy',   emoji: '🟢', desc: '大目標・4 秒顯示・中央區域' },
    { key: 'medium', emoji: '🔵', desc: '中目標・2.5 秒顯示・大範圍' },
    { key: 'hard',   emoji: '🟣', desc: '小目標・1.5 秒顯示・全螢幕' },
  ]

  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-10 gap-7 bg-gradient-to-b from-green-50 to-gray-50">
      <div className="text-center">
        <p className="text-5xl mb-3">🎯</p>
        <h1 className="text-3xl font-extrabold text-gray-900">復能打地鼠</h1>
        <p className="text-gray-500 mt-1.5">移動手臂觸碰出現的目標，訓練肩肘活動度與反應速度</p>
      </div>

      {/* Training targets */}
      <div className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-500 mb-3">訓練目標</p>
        <div className="flex gap-3 flex-wrap">
          {['肩關節屈曲', '肩外展', '肘伸直', '反應速度', '患側注意'].map((t) => (
            <span key={t} className="text-xs font-semibold bg-green-100 text-green-800 px-3 py-1 rounded-full">{t}</span>
          ))}
        </div>
      </div>

      {/* Difficulty selection */}
      <div className="w-full max-w-xl">
        <p className="text-sm font-semibold text-gray-600 mb-3">選擇難度</p>
        <div className="flex flex-col gap-3">
          {diffOptions.map(({ key, emoji, desc }) => {
            const c = CFGS[key]
            const active = selected === key
            return (
              <button
                key={key}
                onClick={() => { touchedRef.current = true; setSelected(key) }}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  active ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span>{emoji}</span>
                  <span className="font-bold text-gray-900">{c.label} {c.sublabel}</span>
                  {recommended === key && (
                    <span className="text-xs font-bold bg-amber-400 text-amber-950 px-2 py-0.5 rounded-full">⭐ AI 建議</span>
                  )}
                  {active && <span className="ml-auto text-xs font-bold text-green-600">已選</span>}
                </div>
                <p className="text-sm text-gray-500">{desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Game info card */}
      <div className="w-full max-w-xl bg-blue-50 rounded-xl p-4">
        <p className="text-sm text-blue-700 leading-relaxed">
          💡 目標出現後，移動手腕/手臂讓偵測圓圈碰觸到目標即算成功。無需捏合手指，只需「伸手觸碰」。
        </p>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 w-full max-w-xl">
        <button
          onClick={onBack}
          className="flex-1 py-4 rounded-xl border-2 border-gray-300 text-gray-700 font-semibold text-lg hover:bg-gray-50 active:scale-[0.97] transition-all"
        >
          ← 返回
        </button>
        <button
          onClick={() => onStart(selected)}
          className="flex-[2] py-4 rounded-xl bg-green-600 text-white font-extrabold text-xl shadow-lg hover:bg-green-700 active:scale-[0.97] transition-all"
        >
          開始訓練 →
        </button>
      </div>
    </main>
  )
}

// ── ResultsView ─────────────────────────────────────────────────────────────

function ResultsView({
  results,
  onReplay,
  onHome,
}: {
  results:  GameResults
  onReplay: () => void
  onHome:   () => void
}) {
  const { hits, misses, hitRecords, difficulty } = results
  const cfg        = CFGS[difficulty]
  const attempts   = hits + misses
  const accuracy   = attempts > 0 ? Math.round((hits / attempts) * 100) : 0
  const successHits = hitRecords.filter((r) => r.success)

  const avgReaction =
    successHits.length > 0
      ? Math.round(successHits.reduce((s, r) => s + r.reactionMs, 0) / successHits.length)
      : 0

  // Zone analysis
  const leftHits   = successHits.filter((r) => r.nx < 0.35).length
  const rightHits  = successHits.filter((r) => r.nx > 0.65).length
  const centerHits = successHits.length - leftHits - rightHits

  // Highest reach: min ny (lower y = higher on screen)
  const highestReachPct =
    successHits.length > 0
      ? Math.round((1 - Math.min(...successHits.map((r) => r.ny))) * 100)
      : 0

  const getRating = () => {
    if (accuracy >= 85) return { emoji: '🏆', text: '太厲害了！' }
    if (accuracy >= 70) return { emoji: '🌟', text: '非常好！' }
    if (accuracy >= 50) return { emoji: '👍', text: '做得好！' }
    return { emoji: '💪', text: '繼續加油！' }
  }
  const { emoji, text } = getRating()

  // 3×3 hit heatmap
  const grid = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, col) => {
      const xMin = col / 3, xMax = (col + 1) / 3
      const yMin = row / 3, yMax = (row + 1) / 3
      return hitRecords.filter((r) => r.nx >= xMin && r.nx < xMax && r.ny >= yMin && r.ny < yMax).length
    })
  )
  const maxCell = Math.max(1, ...grid.flat())

  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-8 gap-5 bg-gradient-to-b from-green-50 to-gray-50">

      {/* Header */}
      <div className="text-center">
        <p className="text-5xl mb-2">{emoji}</p>
        <h1 className="text-3xl font-extrabold text-gray-900">{text}</h1>
        <p className="text-gray-500 mt-1">復能打地鼠 · {cfg.label} {cfg.sublabel}</p>
      </div>

      {/* Score */}
      <div className="bg-blue-600 rounded-2xl px-16 py-4 text-center shadow-lg">
        <p className="text-sm text-blue-200">總分</p>
        <p className="text-6xl font-black text-yellow-400 leading-none">{hits * 10}</p>
        <p className="text-sm text-blue-200">分</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
        {[
          { label: '成功次數', value: `${hits} 次`,   color: 'text-green-700',  bg: 'bg-green-50' },
          { label: '成功率',   value: `${accuracy}%`,  color: 'text-purple-700', bg: 'bg-purple-50' },
          { label: '平均反應', value: avgReaction > 0 ? `${avgReaction} ms` : '—', color: 'text-orange-700', bg: 'bg-orange-50' },
          { label: '最高伸手', value: highestReachPct > 0 ? `${highestReachPct}%` : '—', color: 'text-blue-700', bg: 'bg-blue-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4 text-center`}>
            <p className="text-sm text-gray-500 mb-1">{label}</p>
            <p className={`text-3xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Zone analysis */}
      {successHits.length > 0 && (
        <div className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-600 mb-4">訓練區域分析</p>

          {/* Left/Center/Right bars */}
          <div className="flex gap-3 mb-4">
            {[
              { label: '左側', count: leftHits,   color: '#E65100' },
              { label: '中間', count: centerHits, color: '#1565C0' },
              { label: '右側', count: rightHits,  color: '#2E7D32' },
            ].map(({ label, count, color }) => {
              const pct = Math.round((count / Math.max(1, successHits.length)) * 100)
              return (
                <div key={label} className="flex-1 text-center">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <div className="h-20 bg-gray-100 rounded-lg relative overflow-hidden">
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t-md transition-all duration-700"
                      style={{ height: `${Math.max(pct, count > 0 ? 8 : 0)}%`, background: color }}
                    />
                  </div>
                  <p className="text-lg font-bold mt-1" style={{ color }}>{count}</p>
                  <p className="text-xs text-gray-400">{pct}%</p>
                </div>
              )
            })}
          </div>

          {/* 3×3 heatmap */}
          <p className="text-xs text-gray-500 mb-2">觸碰熱區（上＝高位，顏色深＝觸碰多）</p>
          <div className="grid grid-cols-3 gap-1 max-w-[160px] mx-auto">
            {grid.map((row, ri) =>
              row.map((count, ci) => {
                const intensity = count / maxCell
                return (
                  <div
                    key={`${ri}-${ci}`}
                    className="aspect-square rounded-md flex items-center justify-center text-sm font-bold"
                    style={{
                      background: count > 0 ? `rgba(21,101,192,${0.12 + intensity * 0.78})` : '#F5F5F5',
                      color:      intensity > 0.45 ? '#FFF' : '#9E9E9E',
                    }}
                  >
                    {count > 0 ? count : ''}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Reaction feedback */}
      {avgReaction > 0 && (
        <p className="text-base text-gray-600 text-center">
          {avgReaction < 800  ? '⚡ 反應速度極快！'
          : avgReaction < 1500 ? '⚡ 反應速度很快！'
          : avgReaction < 2500 ? '👌 反應速度不錯'
          :                      '🌱 多練習反應會更快'}
        </p>
      )}

      {/* Buttons */}
      <div className="flex gap-3 w-full max-w-xl mt-2">
        <button
          onClick={onHome}
          className="flex-1 py-4 rounded-xl border-2 border-gray-300 text-gray-700 font-semibold text-lg hover:bg-gray-50 active:scale-[0.97] transition-all"
        >
          🏠 返回首頁
        </button>
        <button
          onClick={onReplay}
          className="flex-[2] py-4 rounded-xl bg-green-600 text-white font-extrabold text-xl shadow-lg hover:bg-green-700 active:scale-[0.97] transition-all"
        >
          🔄 再玩一次
        </button>
      </div>
    </main>
  )
}

// ── Page root ───────────────────────────────────────────────────────────────

export default function WhackMolePage() {
  const router = useRouter()
  const [pagePhase,    setPagePhase]    = useState<PagePhase>('config')
  const [difficulty,   setDifficulty]   = useState<Difficulty>('medium')
  const [gameResults,  setGameResults]  = useState<GameResults | null>(null)

  const { landmarker, isLoading, error: landmarkerError } = useHandLandmarker()
  const { recommended } = useDdaRecommendation('whack-mole')
  const spokeResultRef = useRef(false)

  const handleStart = useCallback((d: Difficulty) => {
    setDifficulty(d)
    setPagePhase('playing')
    speak('開始囉，加油！')
  }, [])

  const handleGameEnd = useCallback((results: GameResults) => {
    setGameResults(results)
    setPagePhase('results')

    // 結算語音鼓勵（每場僅播一次）
    if (!spokeResultRef.current) {
      spokeResultRef.current = true
      const attempts = results.hits + results.misses
      const accuracy = attempts > 0 ? Math.round((results.hits / attempts) * 100) : 0
      speak(accuracy >= 80 ? '太厲害了，做得很好！' : '完成囉，繼續加油！')
    }

    // 存一場訓練數據給治療師後台分析（每場僅呼叫一次；未登入會被靜默忽略）
    const successHits = results.hitRecords.filter((r) => r.success)
    const avgReactionMs =
      successHits.length > 0
        ? Math.round(successHits.reduce((s, r) => s + r.reactionMs, 0) / successHits.length)
        : null
    saveGameSession({
      game_type:       'whack-mole',
      difficulty:      results.difficulty,
      score:           results.hits * 10,
      hits:            results.hits,
      misses:          results.misses,
      avg_reaction_ms: avgReactionMs,
      duration_secs:   60,
      ...computeZones(successHits.map((r) => ({ nx: r.nx, ny: r.ny }))),
    })
  }, [])

  const handleReplay = useCallback(() => {
    setGameResults(null)
    setPagePhase('playing')
    spokeResultRef.current = false
    speak('開始囉，加油！')
  }, [])

  if (pagePhase === 'config') {
    return <ConfigView onStart={handleStart} onBack={() => router.push('/')} recommended={recommended} />
  }

  if (pagePhase === 'playing') {
    return (
      <PlayingView
        cfg={CFGS[difficulty]}
        difficulty={difficulty}
        landmarker={landmarker}
        isLandmarkerLoading={isLoading}
        landmarkerError={landmarkerError}
        onGameEnd={handleGameEnd}
        onBack={() => setPagePhase('config')}
      />
    )
  }

  if (pagePhase === 'results' && gameResults) {
    return (
      <ResultsView
        results={gameResults}
        onReplay={handleReplay}
        onHome={() => router.push('/')}
      />
    )
  }

  return null
}
