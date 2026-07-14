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

const BALLS = ['🔴', '🟡', '🔵', '🟢', '🟣', '🎈']

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
    emoji:       isBomb ? '💣' : BALLS[Math.floor(Math.random() * BALLS.length)],
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
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-cyan-50 flex flex-col items-center px-5 py-10 gap-6 game-menu-screen game-theme-aqua">
      <div className="text-center">
        <div className="text-6xl mb-2">🎈</div>
        <h1 className="text-4xl font-extrabold text-sky-900">彩球復能島</h1>
        <p className="text-gray-500 mt-1 text-base">繽紛彩球從四面八方飄來，伸手觸碰收集，訓練肩外展與手眼協調</p>
      </div>

      {/* Training goals */}
      <div className="w-full max-w-lg bg-white rounded-2xl border border-sky-100 p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-500 mb-2">訓練目標</p>
        <div className="flex flex-wrap gap-2">
          {['肩外展', '肩屈曲', '水平內外收', '肘伸直', '手眼協調', '動作範圍'].map(tag => (
            <span key={tag} className="px-3 py-1 bg-sky-100 text-sky-800 text-sm font-medium rounded-full">{tag}</span>
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
                    ? 'border-sky-400 bg-sky-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-sky-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{icons[key]}</span>
                  <span className="font-bold text-gray-900">{cfg.label}</span>
                  <span className="font-semibold text-gray-600">{cfg.sublabel}</span>
                  {selected && (
                    <span className="ml-auto text-xs font-bold bg-sky-500 text-white px-2 py-0.5 rounded-full">已選</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 ml-7">
                  {key === 'easy'   && '大彩球・慢速・從左右飄來・無炸彈'}
                  {key === 'medium' && '中彩球・中速・多方向飄來・2 個同時'}
                  {key === 'hard'   && '小彩球・快速・拋物線・有炸彈需閃避'}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-sm text-gray-500 max-w-lg text-center">
        💡 彩球飄過來時，移動手腕讓偵測圓圈碰到它即算成功收集。遇到 💣 炸彈請閃開，碰到會扣分。
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
          className="flex-[2] py-3 rounded-2xl bg-sky-500 text-white font-bold text-xl hover:bg-sky-600 active:scale-95 transition-all shadow-md"
        >
          開始訓練 →
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
  const startSpokeRef = useRef(false)
  const noHandTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spawnRef     = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { targetsRef.current = targets }, [targets])

  useEffect(() => { startCamera('user'); return () => stopCamera() }, []) // eslint-disable-line

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    if (!startSpokeRef.current) { startSpokeRef.current = true; speak('開始囉，加油！') }
    if (countdown <= 0) { setPhase('playing'); return }
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
    setTimeout(() => onEnd(hitCountRef.current, missCountRef.current, bombHitsRef.current, recordsRef.current), 600)
  }, [phase, onEnd])

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
    <div className="w-full h-screen flex flex-col overflow-hidden bg-sky-900 game-play-screen game-theme-aqua">
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
            <div className="text-2xl font-bold text-yellow-400">遊戲結束！</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs opacity-70">收集 / 漏接</div>
          <div className="text-4xl font-black text-green-400 leading-none">{hitCount}<span className="text-xl text-gray-400">/{missCount}</span></div>
          {bombHits > 0 && <div className="text-sm text-red-400">💣 ×{bombHits}</div>}
        </div>
      </div>

      {/* Camera + canvas */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <SceneBack theme="island" />
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
              {countdown > 0 ? countdown : '出發！'}
            </div>
            <p className="text-white text-lg mt-6 opacity-60">伸手觸碰飄過來的彩球</p>
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
            收集率 {accuracy}%
          </div>
        )}

        <SceneFront theme="island" />
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

  // Save session to backend (game_type='color-island')
  const savedRef = useRef(false)
  useEffect(() => {
    if (savedRef.current) return
    savedRef.current = true
    const score = Math.max(0, hits * 10 - bombHits * 5)
    fetch('/api/game/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_type:       'color-island',
        difficulty,
        score,
        hits,
        misses,
        avg_reaction_ms: avgRxn > 0 ? avgRxn : null,
        highest_reach:   highestReach > 0 ? highestReach : null,
        left_hits:       leftHits,
        right_hits:      rightHits,
        center_hits:     centerHits,
        duration_secs:   cfg.gameSecs,
        zone_heatmap:    computeZones(records.map(r => ({ nx: r.nx, ny: r.ny }))).zone_heatmap,
        trajectory:      takeTrajectory(),
      }),
    }).catch(() => { /* save best-effort; ignore network errors */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const zoneGrid = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, col) => {
      const xMin = col / 3; const xMax = (col + 1) / 3
      const yMin = row / 3; const yMax = (row + 1) / 3
      return records.filter(r => r.nx >= xMin && r.nx < xMax && r.ny >= yMin && r.ny < yMax).length
    })
  )
  const maxZone = Math.max(1, ...zoneGrid.flat())

  const rating = hits >= 25 ? { e: '🏆', t: '太厲害了！', c: '#0369A1' }
    : hits >= 15 ? { e: '🌟', t: '非常好！',   c: '#1565C0' }
    : hits >= 8  ? { e: '👍', t: '做得好！',   c: '#2E7D32' }
    :              { e: '💪', t: '繼續加油！', c: '#6A1B9A' }

  // Speak result once
  const spokeResultRef = useRef(false)
  useEffect(() => {
    if (spokeResultRef.current) return
    spokeResultRef.current = true
    speak(`遊戲結束，${rating.t}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-cyan-50 flex flex-col items-center px-5 py-10 gap-6 game-menu-screen game-theme-aqua">
      {/* Rating */}
      <div className="text-center">
        <div className="text-6xl">{rating.e}</div>
        <h1 className="text-4xl font-extrabold mt-2" style={{ color: rating.c }}>{rating.t}</h1>
        <p className="text-gray-500 mt-1">彩球復能島 · {cfg.label} {cfg.sublabel}</p>
      </div>

      {/* Score */}
      <div className="bg-sky-900 rounded-3xl px-16 py-5 text-center shadow-xl">
        <p className="text-sky-200 text-lg">總分</p>
        <p className="text-7xl font-black text-yellow-400 leading-none">{Math.max(0, hits * 10 - bombHits * 5)}</p>
        <p className="text-sky-300 text-base mt-1">分</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {[
          { label: '成功收集', value: `${hits} 次`,    color: '#2E7D32' },
          { label: '收集率',   value: `${accuracy}%`, color: '#6A1B9A' },
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
          <p className="text-red-700 font-semibold">💣 碰到炸彈 {bombHits} 次，扣 {bombHits * 5} 分</p>
        </div>
      )}

      {/* Zone analysis */}
      {records.length > 0 && (
        <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="font-bold text-gray-700 mb-4">收集區域分析</p>

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
          <p className="text-sm text-gray-400 mb-2">收集熱區（上＝高位）</p>
          <div className="grid grid-cols-3 gap-1 max-w-[200px] mx-auto">
            {zoneGrid.map((row, ri) => row.map((count, ci) => {
              const intensity = count / maxZone
              return (
                <div key={`${ri}-${ci}`}
                  className="aspect-square rounded-lg flex items-center justify-center text-sm font-bold"
                  style={{
                    background: count > 0 ? `rgba(14,165,233,${0.15 + intensity * 0.75})` : '#F5F5F5',
                    color: intensity > 0.4 ? '#FFF' : '#9E9E9E',
                  }}
                >
                  {count > 0 ? count : ''}
                </div>
              )
            }))}
          </div>
          <p className="text-xs text-gray-300 text-center mt-2">顏色越深 = 收集越多</p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-4 w-full max-w-lg">
        <button onClick={onHome}
          className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg hover:bg-gray-50">
          🏠 換遊戲
        </button>
        <button onClick={onReplay}
          className="flex-[2] py-3 rounded-2xl bg-sky-500 text-white font-bold text-xl hover:bg-sky-600 active:scale-95 transition-all shadow-md">
          🔄 再玩一次
        </button>
      </div>
    </main>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ColorIslandPage() {
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
