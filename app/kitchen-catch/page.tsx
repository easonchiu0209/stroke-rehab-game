'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { useCamera } from '@/hooks/useCamera'
import { useSlashDetector } from '@/hooks/useSlashDetector'
import type { SlashTarget } from '@/hooks/useSlashDetector'
import { computeZones, takeTrajectory } from '@/lib/saveSession'
import { feedbackHit, feedbackMiss, speak } from '@/lib/feedback'
import { SceneBack, SceneFront } from '@/components/game/GameScene'

// ── Types & config ────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard'
type Phase      = 'config' | 'countdown' | 'playing' | 'ended'

interface Cfg {
  label:          string
  sublabel:       string
  hitRadiusPx:    number
  visualEm:       number
  gameSecs:       number
  maxTargets:     number
  spawnIntervalMs: number
  speedMin:       number   // normalized/sec
  speedMax:       number
  gravity:        number   // normalized/sec²
  bombChance:     number   // 0–1, only level 3
  badgeColor:     string
}

const CFGS: Record<Difficulty, Cfg> = {
  easy: {
    label: 'Level 1', sublabel: '被動輔助期',
    hitRadiusPx: 80, visualEm: 72,
    gameSecs: 60, maxTargets: 1, spawnIntervalMs: 2800,
    speedMin: 0.18, speedMax: 0.28, gravity: 0.10,
    bombChance: 0,
    badgeColor: 'bg-green-100 text-green-800',
  },
  medium: {
    label: 'Level 2', sublabel: '主動輔助期',
    hitRadiusPx: 62, visualEm: 56,
    gameSecs: 60, maxTargets: 2, spawnIntervalMs: 1800,
    speedMin: 0.28, speedMax: 0.42, gravity: 0.14,
    bombChance: 0,
    badgeColor: 'bg-blue-100 text-blue-800',
  },
  hard: {
    label: 'Level 3', sublabel: '主動控制期',
    hitRadiusPx: 46, visualEm: 42,
    gameSecs: 60, maxTargets: 3, spawnIntervalMs: 1200,
    speedMin: 0.38, speedMax: 0.56, gravity: 0.18,
    bombChance: 0.22,
    badgeColor: 'bg-purple-100 text-purple-800',
  },
}

// 食材（接到得分）
const INGREDIENTS = ['🍅', '🥚', '🧀', '🥦', '🥕', '🥟']
// 火焰（碰到扣分，等同 slash-fruit 的 bomb 機制）
const FLAME = '🔥'

function makeTarget(cfg: Cfg): SlashTarget {
  // Spawn from left, right, or bottom edge
  const edge = Math.floor(Math.random() * 3)
  let x0: number, y0: number, vx: number, vy: number

  const speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin)

  if (edge === 0) {
    x0 = -0.06; y0 = 0.2 + Math.random() * 0.55
    vx =  speed * (0.8 + Math.random() * 0.4)
    vy = (Math.random() - 0.5) * speed * 0.4
  } else if (edge === 1) {
    x0 = 1.06;  y0 = 0.2 + Math.random() * 0.55
    vx = -speed * (0.8 + Math.random() * 0.4)
    vy = (Math.random() - 0.5) * speed * 0.4
  } else {
    x0 = 0.12 + Math.random() * 0.76; y0 = 1.06
    vx = (Math.random() - 0.5) * speed * 0.4
    vy = -speed * (1.0 + Math.random() * 0.5)
  }

  const isBomb = Math.random() < cfg.bombChance
  return {
    id:          performance.now() + Math.random(),
    x0, y0, vx, vy,
    gravity:     cfg.gravity,
    spawnTime:   performance.now(),
    hitRadiusPx: cfg.hitRadiusPx,
    visualEm:    cfg.visualEm,
    type:        isBomb ? 'bomb' : 'fruit',
    emoji:       isBomb ? FLAME : INGREDIENTS[Math.floor(Math.random() * INGREDIENTS.length)],
  }
}

// ── Hit record ─────────────────────────────────────────────────────────────────

interface HitRecord { nx: number; ny: number; reactionMs: number; type: 'fruit' | 'bomb' }

// ── ConfigView ────────────────────────────────────────────────────────────────

function ConfigView({
  difficulty, setDifficulty, onStart,
}: {
  difficulty: Difficulty
  setDifficulty: (d: Difficulty) => void
  onStart: () => void
}) {
  const router = useRouter()
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 flex flex-col items-center px-5 py-10 gap-6 game-menu-screen game-theme-kitchen">
      <div className="text-center">
        <div className="text-6xl mb-2">🍳</div>
        <h1 className="text-4xl font-extrabold text-amber-900">復能小廚房</h1>
        <p className="text-gray-500 mt-1 text-base">食材從鍋邊飛來，快手接住，閃開火焰，訓練肩屈曲與手眼協調</p>
      </div>

      {/* Training goals */}
      <div className="w-full max-w-lg bg-white rounded-2xl border border-amber-100 p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-500 mb-2">訓練目標</p>
        <div className="flex flex-wrap gap-2">
          {['肩屈曲', '肩外展', '前伸搆取', '肘伸直', '手眼協調', '動作範圍'].map(tag => (
            <span key={tag} className="px-3 py-1 bg-amber-100 text-amber-800 text-sm font-medium rounded-full">{tag}</span>
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div className="w-full max-w-lg">
        <p className="text-base font-semibold text-gray-700 mb-3">選擇難度</p>
        <div className="flex flex-col gap-3">
          {(Object.entries(CFGS) as [Difficulty, Cfg][]).map(([key, cfg]) => {
            const icons: Record<Difficulty, string> = { easy: '🟢', medium: '🔵', hard: '🟣' }
            const selected = difficulty === key
            return (
              <button
                key={key}
                onClick={() => setDifficulty(key)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                  selected
                    ? 'border-amber-400 bg-amber-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-amber-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{icons[key]}</span>
                  <span className="font-bold text-gray-900">{cfg.label}</span>
                  <span className="font-semibold text-gray-600">{cfg.sublabel}</span>
                  {selected && (
                    <span className="ml-auto text-xs font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full">已選</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 ml-7">
                  {key === 'easy'   && '大食材・慢速・從鍋邊飛來・無火焰'}
                  {key === 'medium' && '中食材・中速・多方向飛來・2 個同時'}
                  {key === 'hard'   && '小食材・快速・拋物線・有火焰要閃避'}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-sm text-gray-500 max-w-lg text-center">
        💡 食材飛過來時，移動手腕讓偵測圓圈接住它就算成功。遇到 🔥 火焰請閃開，碰到會扣分。
      </p>

      <div className="flex gap-4 w-full max-w-lg">
        <button
          onClick={() => router.back()}
          className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg hover:bg-gray-50"
        >
          ← 返回
        </button>
        <button
          onClick={onStart}
          className="flex-[2] py-3 rounded-2xl bg-amber-500 text-white font-bold text-xl hover:bg-amber-600 active:scale-95 transition-all shadow-md"
        >
          開始下廚 →
        </button>
      </div>
    </main>
  )
}

// ── PlayingView ───────────────────────────────────────────────────────────────

function PlayingView({
  difficulty,
  onEnd,
}: {
  difficulty: Difficulty
  onEnd: (hits: number, misses: number, bombHits: number, records: HitRecord[]) => void
}) {
  const cfg = CFGS[difficulty]

  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { landmarker }                         = useHandLandmarker()
  const { isReady: cameraReady, startCamera, stopCamera, isMirrored } = useCamera(videoRef)
  const isActive = cameraReady && !!landmarker

  const [phase, setPhase]       = useState<'countdown' | 'playing' | 'ended'>('countdown')
  const [countdown, setCountdown] = useState(3)
  const [timeLeft, setTimeLeft]  = useState(cfg.gameSecs)
  const [score, setScore]        = useState(0)
  const [hitCount, setHitCount]  = useState(0)
  const [missCount, setMissCount] = useState(0)
  const [bombHits, setBombHits]  = useState(0)
  const [targets, setTargets]    = useState<SlashTarget[]>([])
  const [noHand, setNoHand]      = useState(false)

  const phaseRef     = useRef<'countdown' | 'playing' | 'ended'>('countdown')
  const targetsRef   = useRef<SlashTarget[]>([])
  const hitCountRef  = useRef(0)
  const missCountRef = useRef(0)
  const bombHitsRef  = useRef(0)
  const scoreRef     = useRef(0)
  const recordsRef   = useRef<HitRecord[]>([])
  const savedRef     = useRef(false)
  const noHandTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spawnRef     = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { targetsRef.current = targets }, [targets])

  useEffect(() => { startCamera('user'); return () => stopCamera() }, []) // eslint-disable-line

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) { speak('開始囉，加油！'); setPhase('playing'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown])

  // Spawner
  useEffect(() => {
    if (phase !== 'playing') return
    spawnRef.current = setInterval(() => {
      if (phaseRef.current !== 'playing') return
      setTargets(prev => {
        if (prev.length >= cfg.maxTargets * 2) return prev   // hard cap
        return [...prev, makeTarget(cfg)]
      })
    }, cfg.spawnIntervalMs)
    // Spawn first immediately
    setTargets([makeTarget(cfg)])
    return () => { if (spawnRef.current) clearInterval(spawnRef.current) }
  }, [phase, cfg])  // eslint-disable-line

  // Game timer
  useEffect(() => {
    if (phase !== 'playing') return
    if (timeLeft <= 0) { setPhase('ended'); return }
    const t = setTimeout(() => setTimeLeft(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, timeLeft])

  // Save results when ended
  useEffect(() => {
    if (phase !== 'ended' || savedRef.current) return
    savedRef.current = true
    if (spawnRef.current) clearInterval(spawnRef.current)

    // POST results to backend
    const hits    = hitCountRef.current
    const misses  = missCountRef.current
    const bombs   = bombHitsRef.current
    const records = recordsRef.current
    const total   = hits + misses
    const accuracy = total > 0 ? Math.round((hits / total) * 100) : 0
    const finalScore = Math.max(0, hits * 10 - bombs * 5)
    const avgRxn = records.length > 0
      ? Math.round(records.reduce((s, r) => s + r.reactionMs, 0) / records.length)
      : 0
    const highestReach = records.length > 0
      ? Math.round((1 - Math.min(...records.map(r => r.ny))) * 100)
      : 0
    const leftHits   = records.filter(r => r.nx < 0.35).length
    const rightHits  = records.filter(r => r.nx > 0.65).length
    const centerHits = records.length - leftHits - rightHits

    speak(hits >= 15 ? '太厲害了，下廚完成！' : hits >= 8 ? '做得好，完成囉！' : '辛苦了，下次再加油！')

    fetch('/api/game/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_type:       'kitchen-catch',
        difficulty,
        score:           finalScore,
        hits,
        misses,
        accuracy,
        avg_reaction_ms: avgRxn || null,
        highest_reach:   highestReach || null,
        left_hits:       leftHits,
        right_hits:      rightHits,
        center_hits:     centerHits,
        duration_secs:   cfg.gameSecs,
        zone_heatmap:    computeZones(records.map(r => ({ nx: r.nx, ny: r.ny }))).zone_heatmap,
        trajectory:      takeTrajectory(),
      }),
    }).catch(() => { /* ignore network/auth errors so results page still shows */ })

    setTimeout(() => onEnd(hits, misses, bombs, records), 600)
  }, [phase, onEnd, difficulty, cfg.gameSecs])

  const handleHit = useCallback((
    id: number, type: 'fruit' | 'bomb', reactionMs: number, nx: number, ny: number,
  ) => {
    if (phaseRef.current !== 'playing') return
    setTargets(prev => prev.filter(t => t.id !== id))
    if (type === 'bomb') {
      feedbackMiss()
      bombHitsRef.current++
      setBombHits(n => n + 1)
      scoreRef.current = Math.max(0, scoreRef.current - 5)
      setScore(scoreRef.current)
    } else {
      feedbackHit()
      hitCountRef.current++
      scoreRef.current += 10
      setHitCount(n => n + 1)
      setScore(scoreRef.current)
      recordsRef.current.push({ nx, ny, reactionMs, type: 'fruit' })
    }
  }, [])

  const handleExpired = useCallback((id: number) => {
    if (phaseRef.current !== 'playing') return
    setTargets(prev => prev.filter(t => t.id !== id))
    missCountRef.current++
    setMissCount(n => n + 1)
  }, [])

  const { handDetected, setTargets: syncDetector } = useSlashDetector({
    landmarker,
    videoRef,
    canvasRef,
    isActive,
    isMirrored,
    onHit:      handleHit,
    onExpired:  handleExpired,
  })

  // Sync targets to detector whenever they change
  useEffect(() => {
    syncDetector(targets)
  }, [targets, syncDetector])

  // No-hand warning
  useEffect(() => {
    if (phase !== 'playing') return
    if (!handDetected) {
      noHandTimer.current = setTimeout(() => setNoHand(true), 3000)
    } else {
      if (noHandTimer.current) clearTimeout(noHandTimer.current)
      setNoHand(false)
    }
    return () => { if (noHandTimer.current) clearTimeout(noHandTimer.current) }
  }, [phase, handDetected])

  const total    = hitCount + missCount
  const accuracy = total > 0 ? Math.round((hitCount / total) * 100) : 0

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-stone-800 game-play-screen game-theme-kitchen">
      {/* HUD */}
      <div className="flex justify-between items-center px-6 py-3 bg-black/60 text-white shrink-0 z-10">
        <div>
          <div className="text-xs opacity-70">分數</div>
          <div className="text-4xl font-black text-yellow-400 leading-none">{score}</div>
        </div>
        <div className="text-center">
          {phase === 'countdown' && (
            <div className="text-6xl font-black">{countdown > 0 ? countdown : '開始！'}</div>
          )}
          {phase === 'playing' && (
            <>
              <div className="text-xs opacity-70">剩餘時間</div>
              <div className={`text-5xl font-black leading-none ${timeLeft <= 10 ? 'text-red-400' : 'text-white'}`}>
                {timeLeft}
              </div>
            </>
          )}
          {phase === 'ended' && (
            <div className="text-2xl font-bold text-yellow-400">下廚完成！</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs opacity-70">接住 / 漏接</div>
          <div className="text-4xl font-black text-green-400 leading-none">{hitCount}<span className="text-xl text-gray-400">/{missCount}</span></div>
          {bombHits > 0 && <div className="text-sm text-red-400">🔥 ×{bombHits}</div>}
        </div>
      </div>

      {/* Camera + canvas */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <SceneBack theme="kitchen" />
        <video
          ref={videoRef}
          autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: isMirrored ? 'scaleX(-1)' : undefined, opacity: 0 }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: isMirrored ? 'scaleX(-1)' : undefined }}
        />

        {/* Countdown overlay */}
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
            <p className="text-white text-2xl mb-4 opacity-80">準備好了嗎？</p>
            <div className="text-yellow-400 text-9xl font-black" style={{ textShadow: '0 0 40px rgba(255,214,0,0.7)' }}>
              {countdown > 0 ? countdown : '開動！'}
            </div>
            <p className="text-white text-lg mt-6 opacity-60">伸手接住飛過來的食材</p>
          </div>
        )}

        {/* No-hand warning */}
        {noHand && phase === 'playing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-4">
            <div className="text-6xl">👋</div>
            <p className="text-white text-2xl font-semibold">未偵測到手部</p>
            <p className="text-gray-300 text-lg">請將手放到鏡頭前方</p>
          </div>
        )}

        {/* Accuracy badge */}
        {phase === 'playing' && total > 0 && (
          <div className="absolute bottom-4 right-4 bg-black/50 text-white px-3 py-1.5 rounded-xl text-sm font-bold">
            接取率 {accuracy}%
          </div>
        )}

        {/* Themed foreground decorations + vignette */}
        <SceneFront theme="kitchen" />
      </div>
    </div>
  )
}

// ── ResultsView ───────────────────────────────────────────────────────────────

function ResultsView({
  difficulty, hits, misses, bombHits, records, onReplay, onHome,
}: {
  difficulty: Difficulty
  hits:       number
  misses:     number
  bombHits:   number
  records:    HitRecord[]
  onReplay:   () => void
  onHome:     () => void
}) {
  const cfg      = CFGS[difficulty]
  const total    = hits + misses
  const accuracy = total > 0 ? Math.round((hits / total) * 100) : 0
  const avgRxn   = records.length > 0
    ? Math.round(records.reduce((s, r) => s + r.reactionMs, 0) / records.length)
    : 0
  const highestReach = records.length > 0
    ? Math.round((1 - Math.min(...records.map(r => r.ny))) * 100)
    : 0

  const leftHits   = records.filter(r => r.nx < 0.35).length
  const rightHits  = records.filter(r => r.nx > 0.65).length
  const centerHits = records.length - leftHits - rightHits

  const zoneGrid = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, col) => {
      const xMin = col / 3; const xMax = (col + 1) / 3
      const yMin = row / 3; const yMax = (row + 1) / 3
      return records.filter(r => r.nx >= xMin && r.nx < xMax && r.ny >= yMin && r.ny < yMax).length
    })
  )
  const maxZone = Math.max(1, ...zoneGrid.flat())

  const rating = hits >= 25 ? { e: '🏆', t: '大廚出師！', c: '#F57F17' }
    : hits >= 15 ? { e: '🌟', t: '非常好！',   c: '#1565C0' }
    : hits >= 8  ? { e: '👍', t: '做得好！',   c: '#2E7D32' }
    :              { e: '💪', t: '繼續加油！', c: '#6A1B9A' }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 flex flex-col items-center px-5 py-10 gap-6 game-menu-screen game-theme-kitchen">
      {/* Rating */}
      <div className="text-center">
        <div className="text-6xl">{rating.e}</div>
        <h1 className="text-4xl font-extrabold mt-2" style={{ color: rating.c }}>{rating.t}</h1>
        <p className="text-gray-500 mt-1">復能小廚房 · {cfg.label} {cfg.sublabel}</p>
      </div>

      {/* Score */}
      <div className="bg-amber-900 rounded-3xl px-16 py-5 text-center shadow-xl">
        <p className="text-amber-200 text-lg">總分</p>
        <p className="text-7xl font-black text-yellow-400 leading-none">{Math.max(0, hits * 10 - bombHits * 5)}</p>
        <p className="text-amber-300 text-base mt-1">分</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {[
          { label: '成功接取', value: `${hits} 次`,    color: '#2E7D32' },
          { label: '接取率',   value: `${accuracy}%`, color: '#6A1B9A' },
          { label: '平均反應', value: avgRxn > 0 ? `${avgRxn} ms` : '—', color: '#E65100' },
          { label: '最高伸手', value: highestReach > 0 ? `${highestReach}%` : '—', color: '#1565C0' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 text-center shadow-sm border-2" style={{ borderColor: s.color + '20' }}>
            <p className="text-sm text-gray-500 mb-1">{s.label}</p>
            <p className="text-3xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {bombHits > 0 && (
        <div className="w-full max-w-lg bg-red-50 border border-red-200 rounded-2xl p-3 text-center">
          <p className="text-red-700 font-semibold">🔥 碰到火焰 {bombHits} 次，扣 {bombHits * 5} 分</p>
        </div>
      )}

      {/* Zone analysis */}
      {records.length > 0 && (
        <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="font-bold text-gray-700 mb-4">接取區域分析</p>

          {/* Left/Center/Right */}
          <div className="flex gap-3 items-end mb-5">
            {[
              { label: '左側', count: leftHits, color: '#E65100' },
              { label: '中間', count: centerHits, color: '#1565C0' },
              { label: '右側', count: rightHits, color: '#2E7D32' },
            ].map(z => {
              const pct = Math.round((z.count / Math.max(1, records.length)) * 100)
              return (
                <div key={z.label} className="flex-1 text-center">
                  <div className="text-sm text-gray-500 mb-1">{z.label}</div>
                  <div className="h-20 bg-gray-100 rounded-lg relative overflow-hidden">
                    <div className="absolute bottom-0 left-0 right-0 rounded-t-md transition-all duration-700"
                      style={{ height: `${pct}%`, background: z.color, minHeight: z.count > 0 ? 6 : 0 }} />
                  </div>
                  <div className="text-xl font-bold mt-1" style={{ color: z.color }}>{z.count} 次</div>
                  <div className="text-xs text-gray-400">{pct}%</div>
                </div>
              )
            })}
          </div>

          {/* 3×3 heatmap */}
          <p className="text-sm text-gray-400 mb-2">接取熱區（上＝高位）</p>
          <div className="grid grid-cols-3 gap-1 max-w-[200px] mx-auto">
            {zoneGrid.map((row, ri) => row.map((count, ci) => {
              const intensity = count / maxZone
              return (
                <div key={`${ri}-${ci}`}
                  className="aspect-square rounded-lg flex items-center justify-center text-sm font-bold"
                  style={{
                    background: count > 0 ? `rgba(234,88,12,${0.15 + intensity * 0.75})` : '#F5F5F5',
                    color: intensity > 0.4 ? '#FFF' : '#9E9E9E',
                  }}
                >
                  {count > 0 ? count : ''}
                </div>
              )
            }))}
          </div>
          <p className="text-xs text-gray-300 text-center mt-2">顏色越深 = 接取越多</p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-4 w-full max-w-lg">
        <button onClick={onHome}
          className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg hover:bg-gray-50">
          🏠 換遊戲
        </button>
        <button onClick={onReplay}
          className="flex-[2] py-3 rounded-2xl bg-amber-500 text-white font-bold text-xl hover:bg-amber-600 active:scale-95 transition-all shadow-md">
          🔄 再煮一次
        </button>
      </div>
    </main>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KitchenCatchPage() {
  const router = useRouter()

  const [phase,      setPhase]      = useState<Phase>('config')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [results,    setResults]    = useState<{
    hits: number; misses: number; bombHits: number; records: HitRecord[]
  } | null>(null)

  const handleEnd = useCallback((
    hits: number, misses: number, bombHits: number, records: HitRecord[],
  ) => {
    setResults({ hits, misses, bombHits, records })
    setPhase('ended')
  }, [])

  if (phase === 'config') {
    return (
      <ConfigView
        difficulty={difficulty}
        setDifficulty={setDifficulty}
        onStart={() => setPhase('countdown')}
      />
    )
  }

  if (phase === 'countdown' || phase === 'playing') {
    return (
      <PlayingView
        key={difficulty}
        difficulty={difficulty}
        onEnd={handleEnd}
      />
    )
  }

  return (
    <ResultsView
      difficulty={difficulty}
      hits={results?.hits ?? 0}
      misses={results?.misses ?? 0}
      bombHits={results?.bombHits ?? 0}
      records={results?.records ?? []}
      onReplay={() => { setResults(null); setPhase('countdown') }}
      onHome={() => router.push('/')}
    />
  )
}
