'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { useCamera } from '@/hooks/useCamera'
import { useSwingDetector, type Shuttle } from '@/hooks/useSwingDetector'
import { saveGameSession, computeZones } from '@/lib/saveSession'
import { usePoseMonitor } from '@/hooks/usePoseMonitor'
import CompensationHint from '@/components/game/CompensationHint'
import JuiceLayer, { type JuiceHandle } from '@/components/game/JuiceLayer'
import { useFlowDda, useDdaRecommendation } from '@/hooks/useFlowDda'
import { feedbackHit, feedbackMiss, speak } from '@/lib/feedback'

// ── Types & config ────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard'
type Phase      = 'config' | 'countdown' | 'playing' | 'ended'

interface Cfg {
  label:          string
  sublabel:       string
  hitRadiusPx:    number
  gameSecs:       number
  flightMs:       number   // 來球全程飛行時間（越短越快）
  swingThreshold: number   // 揮速門檻（normalized/sec）
  serveDelayMs:   number   // 漏接後重新發球的間隔
  spreadMin:      number   // 落點 x 範圍（跨中線設計：越寬越需要左右移動）
  spreadMax:      number
  crossCourt:     boolean  // 強制對角球（落點偏向上一球的另一側）
}

const CFGS: Record<Difficulty, Cfg> = {
  easy: {
    label: 'Level 1', sublabel: '被動輔助期',
    hitRadiusPx: 95, gameSecs: 60,
    flightMs: 2700, swingThreshold: 0.45, serveDelayMs: 1500,
    spreadMin: 0.3, spreadMax: 0.7, crossCourt: false,
  },
  medium: {
    label: 'Level 2', sublabel: '主動輔助期',
    hitRadiusPx: 75, gameSecs: 60,
    flightMs: 2100, swingThreshold: 0.75, serveDelayMs: 1200,
    spreadMin: 0.18, spreadMax: 0.82, crossCourt: false,
  },
  hard: {
    label: 'Level 3', sublabel: '主動控制期',
    hitRadiusPx: 58, gameSecs: 60,
    flightMs: 1600, swingThreshold: 1.05, serveDelayMs: 900,
    spreadMin: 0.12, spreadMax: 0.88, crossCourt: true,
  },
}

interface HitRecord { nx: number; ny: number; reactionMs: number; speed: number }

// ── ConfigView ────────────────────────────────────────────────────────────────

function ConfigView({
  difficulty, setDifficulty, onStart, recommended,
}: {
  difficulty: Difficulty
  setDifficulty: (d: Difficulty) => void
  onStart: () => void
  recommended: Difficulty | null
}) {
  const router = useRouter()
  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 to-teal-50 flex flex-col items-center px-5 py-10 gap-6">
      <div className="text-center">
        <div className="text-6xl mb-2">🏸</div>
        <h1 className="text-4xl font-extrabold text-emerald-900">復能羽球</h1>
        <p className="text-gray-500 mt-1 text-base">揮動手臂把羽球打回去，和對手來回對打，訓練揮臂速度與大範圍活動</p>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl border border-emerald-100 p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-500 mb-2">訓練目標</p>
        <div className="flex flex-wrap gap-2">
          {['肩全範圍活動', '肘伸展', '跨中線動作', '揮臂速度', '動作時序預判'].map(tag => (
            <span key={tag} className="px-3 py-1 bg-emerald-100 text-emerald-800 text-sm font-medium rounded-full">{tag}</span>
          ))}
        </div>
      </div>

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
                    ? 'border-emerald-400 bg-emerald-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-emerald-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{icons[key]}</span>
                  <span className="font-bold text-gray-900">{cfg.label}</span>
                  <span className="font-semibold text-gray-600">{cfg.sublabel}</span>
                  {recommended === key && (
                    <span className="text-xs font-bold bg-amber-400 text-amber-950 px-2 py-0.5 rounded-full">⭐ AI 建議</span>
                  )}
                  {selected && (
                    <span className="ml-auto text-xs font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">已選</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 ml-7">
                  {key === 'easy'   && '球慢・落點集中中間・輕輕揮就打得到'}
                  {key === 'medium' && '中速・落點左右分散・需要明顯揮動'}
                  {key === 'hard'   && '快球・對角調動・要用力揮拍才打得到'}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-sm text-gray-500 max-w-lg text-center">
        💡 羽球飛過網後出現綠色光圈，把手「揮」進光圈——手腕游標變綠代表揮速夠快。坐著玩就可以。
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
          className="flex-[2] py-3 rounded-2xl bg-emerald-500 text-white font-bold text-xl hover:bg-emerald-600 active:scale-95 transition-all shadow-md"
        >
          開始對打 →
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
  onEnd: (hits: number, misses: number, maxRally: number, records: HitRecord[]) => void
}) {
  const cfg = CFGS[difficulty]

  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const juiceRef  = useRef<JuiceHandle>(null)

  const { landmarker } = useHandLandmarker()
  const { isReady: cameraReady, startCamera, stopCamera, isMirrored } = useCamera(videoRef)
  const isActive = cameraReady && !!landmarker

  const [phase, setPhase]         = useState<'countdown' | 'playing' | 'ended'>('countdown')
  const [countdown, setCountdown] = useState(3)
  const [timeLeft, setTimeLeft]   = useState(cfg.gameSecs)
  const [score, setScore]         = useState(0)
  const [hitCount, setHitCount]   = useState(0)
  const [missCount, setMissCount] = useState(0)
  const [rally, setRally]         = useState(0)
  const [oppX, setOppX]           = useState(0.5)   // 對手站位（normalized）
  const [noHand, setNoHand]       = useState(false)

  const phaseRef     = useRef<'countdown' | 'playing' | 'ended'>('countdown')
  const hitCountRef  = useRef(0)
  const missCountRef = useRef(0)
  const rallyRef     = useRef(0)
  const maxRallyRef  = useRef(0)
  const scoreRef     = useRef(0)
  const recordsRef   = useRef<HitRecord[]>([])
  const lastLandXRef = useRef(0.5)   // 上一球落點（對角球用）
  const savedRef     = useRef(false)
  const noHandTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timersRef    = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => { phaseRef.current = phase }, [phase])

  const { hint: poseHint } = usePoseMonitor({
    videoRef, isMirrored,
    active: phase === 'countdown' || phase === 'playing',
  })

  // 場中心流 DDA：滾動命中率調整球速（維持甜蜜區）
  const { reportHit, reportMiss, getFactor } = useFlowDda(phase === 'playing')

  useEffect(() => { startCamera('user'); return () => stopCamera() }, []) // eslint-disable-line

  const startSpokenRef = useRef(false)
  useEffect(() => {
    if (startSpokenRef.current) return
    startSpokenRef.current = true
    speak('羽球對打開始，揮動手臂把球打回去！')
  }, [])

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) { setPhase('playing'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown])

  // Game timer
  useEffect(() => {
    if (phase !== 'playing') return
    if (timeLeft <= 0) { setPhase('ended'); return }
    const t = setTimeout(() => setTimeLeft(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, timeLeft])

  function later(fn: () => void, ms: number) {
    timersRef.current.push(setTimeout(() => { if (phaseRef.current === 'playing') fn() }, ms))
  }

  // 發球（對手 → 個案）：落點依難度分散；hard 強制對角調動
  const serve = useCallback((fromX: number) => {
    let landX = cfg.spreadMin + Math.random() * (cfg.spreadMax - cfg.spreadMin)
    if (cfg.crossCourt) {
      // 落到上一球的另一側，逼出跨中線移動
      landX = lastLandXRef.current < 0.5
        ? 0.5 + Math.random() * (cfg.spreadMax - 0.5)
        : cfg.spreadMin + Math.random() * (0.5 - cfg.spreadMin)
    }
    lastLandXRef.current = landX
    const f = getFactor()   // DDA：>1 = 更難 = 球更快
    setShuttleState({
      id: performance.now() + Math.random(),
      x0: fromX, y0: 0.16, x1: landX, y1: 0.95,
      flightMs: cfg.flightMs / f,
      arcH: 0.30 + Math.random() * 0.12,
      spawnTime: performance.now(),
      hitRadiusPx: cfg.hitRadiusPx,
      phase: 'in',
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg])

  // shuttle 同步進 detector（用 state 包一層，維持 React 資料流）
  const [shuttleState, setShuttleState] = useState<Shuttle | null>(null)

  const handleHit = useCallback((id: number, info: { speed: number; nx: number; ny: number; reactionMs: number }) => {
    if (phaseRef.current !== 'playing') return
    reportHit()
    feedbackHit()
    hitCountRef.current++
    setHitCount(hitCountRef.current)
    rallyRef.current++
    setRally(rallyRef.current)
    maxRallyRef.current = Math.max(maxRallyRef.current, rallyRef.current)
    scoreRef.current += 10 + Math.min(10, rallyRef.current)   // rally 越長加分越多
    setScore(scoreRef.current)
    recordsRef.current.push({ nx: info.nx, ny: info.ny, reactionMs: info.reactionMs, speed: info.speed })
    juiceRef.current?.burst(info.nx, info.ny, { emojis: ['✨', '💨'] })
    juiceRef.current?.floatText(info.nx, info.ny - 0.06, `+${10 + Math.min(10, rallyRef.current)}`)
    juiceRef.current?.shake(0.4)
    if (rallyRef.current > 0 && rallyRef.current % 5 === 0) speak(`連續 ${rallyRef.current} 拍，太強了！`)

    // 球回飛到對手側，對手移動去接
    const backX = 0.2 + Math.random() * 0.6
    setShuttleState({
      id: performance.now() + Math.random(),
      x0: info.nx, y0: info.ny, x1: backX, y1: 0.14,
      flightMs: cfg.flightMs * 0.7,
      arcH: 0.26,
      spawnTime: performance.now(),
      hitRadiusPx: cfg.hitRadiusPx,
      phase: 'out',
    })
    setOppX(backX)
  }, [cfg, reportHit])

  const handleLanded = useCallback((id: number, shuttlePhase: 'in' | 'out') => {
    if (phaseRef.current !== 'playing') return
    setShuttleState(null)
    if (shuttlePhase === 'in') {
      // 漏接：rally 中斷，稍後重新發球
      feedbackMiss()
      missCountRef.current++
      setMissCount(missCountRef.current)
      if (rallyRef.current >= 3) speak('可惜，再來一球！')
      rallyRef.current = 0
      setRally(0)
      reportMiss()
      later(() => serve(oppXRef.current), cfg.serveDelayMs)
    } else {
      // 對手接到 → 小停頓後回擊
      later(() => serve(oppXRef.current), 220)
    }
  }, [cfg, serve, reportMiss]) // eslint-disable-line react-hooks/exhaustive-deps

  const oppXRef = useRef(0.5)
  useEffect(() => { oppXRef.current = oppX }, [oppX])

  const { handDetected, swingSpeed, setShuttle } = useSwingDetector({
    landmarker, videoRef, canvasRef, isActive, isMirrored,
    swingThreshold: cfg.swingThreshold,
    onHit:    handleHit,
    onLanded: handleLanded,
  })

  useEffect(() => { setShuttle(shuttleState) }, [shuttleState, setShuttle])

  // 開局第一球
  const firstServeRef = useRef(false)
  useEffect(() => {
    if (phase !== 'playing' || firstServeRef.current) return
    firstServeRef.current = true
    later(() => serve(0.5), 800)
  }, [phase, serve]) // eslint-disable-line react-hooks/exhaustive-deps

  // 結束：清計時器＋回報
  useEffect(() => {
    if (phase !== 'ended' || savedRef.current) return
    savedRef.current = true
    timersRef.current.forEach(clearTimeout)
    setShuttleState(null)
    speak(hitCountRef.current >= 10 ? '打得太精彩了！' : '辛苦了，下次再加油！')
    setTimeout(() => onEnd(hitCountRef.current, missCountRef.current, maxRallyRef.current, recordsRef.current), 600)
  }, [phase, onEnd])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

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

  const charged = swingSpeed >= cfg.swingThreshold

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-gray-900">
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
            <div className="text-2xl font-bold text-yellow-400">比賽結束！</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs opacity-70">連續對打</div>
          <div className="text-4xl font-black text-green-400 leading-none">{rally}<span className="text-xl text-gray-400"> 拍</span></div>
          <div className="text-sm text-gray-400">回擊 {hitCount}・漏接 {missCount}</div>
        </div>
      </div>

      {/* Court + camera */}
      <div className="relative flex-1 overflow-hidden bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-800">
        {/* 球場線＋網 */}
        <div className="absolute inset-x-[8%] top-[30%] h-1 bg-white/25 rounded" />
        <div className="absolute inset-x-[8%] top-[30%] h-6 -translate-y-full"
          style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 2px, transparent 2px 10px), repeating-linear-gradient(0deg, rgba(255,255,255,0.18) 0 2px, transparent 2px 8px)' }} />
        <div className="absolute inset-x-[8%] bottom-[4%] h-1 bg-white/15 rounded" />

        {/* 對手 */}
        <div className="absolute top-[6%] -translate-x-1/2 transition-all duration-500 ease-out text-center z-[5]"
          style={{ left: `${oppX * 100}%` }}>
          <div className="text-5xl">🐻</div>
          <div className="text-2xl -mt-3">🏸</div>
        </div>

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

        <CompensationHint hint={poseHint} />
        <JuiceLayer ref={juiceRef} />

        {/* 揮速充能提示 */}
        {phase === 'playing' && (
          <div className={`absolute bottom-4 left-4 px-3 py-1.5 rounded-xl text-sm font-bold transition-colors ${
            charged ? 'bg-green-500/80 text-white' : 'bg-black/50 text-gray-300'
          }`}>
            {charged ? '⚡ 揮拍中！' : '揮動手臂來擊球'}
          </div>
        )}

        {/* Countdown overlay */}
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-10">
            <p className="text-white text-2xl mb-4 opacity-80">準備好了嗎？</p>
            <div className="text-yellow-400 text-9xl font-black" style={{ textShadow: '0 0 40px rgba(255,214,0,0.7)' }}>
              {countdown > 0 ? countdown : '發球！'}
            </div>
            <p className="text-white text-lg mt-6 opacity-60">球過網後，把手揮進綠色光圈</p>
          </div>
        )}

        {/* No-hand warning */}
        {noHand && phase === 'playing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-4 z-10">
            <div className="text-6xl">👋</div>
            <p className="text-white text-2xl font-semibold">未偵測到手部</p>
            <p className="text-gray-300 text-lg">請將手放到鏡頭前方</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── ResultsView ───────────────────────────────────────────────────────────────

function ResultsView({
  difficulty, hits, misses, maxRally, records, onReplay, onHome,
}: {
  difficulty: Difficulty
  hits:       number
  misses:     number
  maxRally:   number
  records:    HitRecord[]
  onReplay:   () => void
  onHome:     () => void
}) {
  const cfg      = CFGS[difficulty]
  const total    = hits + misses
  const accuracy = total > 0 ? Math.round((hits / total) * 100) : 0
  const avgSwing = records.length > 0
    ? Math.round((records.reduce((s, r) => s + r.speed, 0) / records.length) * 100)
    : 0
  const leftHits  = records.filter(r => r.nx < 0.5).length
  const rightHits = records.length - leftHits

  const rating = maxRally >= 8 ? { e: '🏆', t: '羽球高手！', c: '#F57F17' }
    : maxRally >= 5 ? { e: '🌟', t: '對打很穩！', c: '#1565C0' }
    : hits >= 5     ? { e: '👍', t: '做得好！',   c: '#2E7D32' }
    :                 { e: '💪', t: '繼續加油！', c: '#6A1B9A' }

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 to-teal-50 flex flex-col items-center px-5 py-10 gap-6">
      <div className="text-center">
        <div className="text-6xl">{rating.e}</div>
        <h1 className="text-4xl font-extrabold mt-2" style={{ color: rating.c }}>{rating.t}</h1>
        <p className="text-gray-500 mt-1">復能羽球 · {cfg.label} {cfg.sublabel}</p>
      </div>

      <div className="bg-emerald-900 rounded-3xl px-16 py-5 text-center shadow-xl">
        <p className="text-emerald-200 text-lg">最長連續對打</p>
        <p className="text-7xl font-black text-yellow-400 leading-none">{maxRally}</p>
        <p className="text-emerald-300 text-base mt-1">拍</p>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {[
          { label: '成功回擊', value: `${hits} 球`,   color: '#2E7D32' },
          { label: '回擊率',   value: `${accuracy}%`, color: '#6A1B9A' },
          { label: '平均揮速', value: avgSwing > 0 ? `${avgSwing} 揮速值` : '—', color: '#E65100' },
          { label: '左／右側回擊', value: `${leftHits}／${rightHits}`, color: '#1565C0' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 text-center shadow-sm border-2" style={{ borderColor: s.color + '20' }}>
            <p className="text-sm text-gray-500 mb-1">{s.label}</p>
            <p className="text-3xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {records.length > 0 && Math.abs(leftHits - rightHits) >= 3 && (
        <div className="w-full max-w-lg bg-sky-50 border border-sky-200 rounded-2xl p-3 text-center">
          <p className="text-sky-700 text-sm font-semibold">
            {leftHits > rightHits ? '右側' : '左側'}回擊較少——下次多注意那一側飛來的球，練習跨過身體中線 💡
          </p>
        </div>
      )}

      <div className="flex gap-4 w-full max-w-lg">
        <button onClick={onHome}
          className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg hover:bg-gray-50">
          🏠 換遊戲
        </button>
        <button onClick={onReplay}
          className="flex-[2] py-3 rounded-2xl bg-emerald-500 text-white font-bold text-xl hover:bg-emerald-600 active:scale-95 transition-all shadow-md">
          🔄 再打一場
        </button>
      </div>
    </main>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BadmintonPage() {
  const router = useRouter()

  const [phase,      setPhase]      = useState<Phase>('config')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const { recommended } = useDdaRecommendation('badminton')
  const touchedRef = useRef(false)

  useEffect(() => {
    if (recommended && !touchedRef.current) setDifficulty(recommended)
  }, [recommended])

  const [results, setResults] = useState<{
    hits: number; misses: number; maxRally: number; records: HitRecord[]
  } | null>(null)

  const savedRef = useRef(false)

  const handleEnd = useCallback((
    hits: number, misses: number, maxRally: number, records: HitRecord[],
  ) => {
    setResults({ hits, misses, maxRally, records })
    setPhase('ended')

    if (!savedRef.current) {
      savedRef.current = true
      const avgReactionMs = records.length > 0
        ? Math.round(records.reduce((s, r) => s + r.reactionMs, 0) / records.length)
        : null
      void saveGameSession({
        game_type: 'badminton',
        difficulty,
        score: hits * 10 + maxRally * 5,
        hits,
        misses,
        avg_reaction_ms: avgReactionMs,
        duration_secs: 60,
        ...computeZones(records.map(r => ({ nx: r.nx, ny: r.ny }))),
      })
    }
  }, [difficulty])

  if (phase === 'config') {
    return (
      <ConfigView
        difficulty={difficulty}
        setDifficulty={(d) => { touchedRef.current = true; setDifficulty(d) }}
        recommended={recommended}
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
      maxRally={results?.maxRally ?? 0}
      records={results?.records ?? []}
      onReplay={() => { setResults(null); savedRef.current = false; setPhase('countdown') }}
      onHome={() => router.push('/')}
    />
  )
}
