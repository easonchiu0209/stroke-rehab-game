'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { useCamera } from '@/hooks/useCamera'
import { useSlashDetector, juiceToneForId } from '@/hooks/useSlashDetector'
import type { SlashTarget } from '@/hooks/useSlashDetector'
import { saveGameSession, computeZones } from '@/lib/saveSession'
import { usePoseMonitor } from '@/hooks/usePoseMonitor'
import CompensationHint from '@/components/game/CompensationHint'
import JuiceLayer, { type JuiceHandle } from '@/components/game/JuiceLayer'
import { useFlowDda, useDdaRecommendation } from '@/hooks/useFlowDda'
import { feedbackHit, feedbackMiss, speak } from '@/lib/feedback'
import { SceneFront } from '@/components/game/GameScene'
import { OrchardScene } from '@/components/game/SceneKit'

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

const FRUITS = ['🍎', '🍊', '🍋', '🍇', '🍓', '🍉', '🍑', '🍒', '🥭', '🫐', '🍌', '🍍']

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
    emoji:       isBomb ? '💣' : FRUITS[Math.floor(Math.random() * FRUITS.length)],
  }
}

// ── Hit record ─────────────────────────────────────────────────────────────────

interface HitRecord { nx: number; ny: number; reactionMs: number; type: 'fruit' | 'bomb' }

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
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-yellow-50 flex flex-col items-center px-5 py-10 gap-6 game-menu-screen game-theme-orchard">
      <div className="text-center">
        <div className="text-6xl mb-2">🍎</div>
        <h1 className="text-4xl font-extrabold text-orange-900">復能切切樂</h1>
        <p className="text-gray-500 mt-1 text-base">移動手臂觸碰飛來的物件，訓練肩肘活動度與手眼協調</p>
      </div>

      {/* Training goals */}
      <div className="w-full max-w-lg bg-white rounded-2xl border border-orange-100 p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-500 mb-2">訓練目標</p>
        <div className="flex flex-wrap gap-2">
          {['肩屈曲', '肩外展', '水平內外收', '肘伸直', '手眼協調', '動作範圍'].map(tag => (
            <span key={tag} className="px-3 py-1 bg-orange-100 text-orange-800 text-sm font-medium rounded-full">{tag}</span>
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
                    ? 'border-orange-400 bg-orange-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-orange-300'
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
                    <span className="ml-auto text-xs font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full">已選</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 ml-7">
                  {key === 'easy'   && '大目標・慢速・從左右飛來・無炸彈'}
                  {key === 'medium' && '中目標・中速・多方向飛來・2 個同時'}
                  {key === 'hard'   && '小目標・快速・拋物線・有炸彈需閃避'}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-sm text-gray-500 max-w-lg text-center">
        💡 物件飛過來時，移動手腕讓偵測圓圈碰到它即算成功。遇到 💣 炸彈請閃開，碰到會扣分。
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
          className="flex-[2] py-3 rounded-2xl bg-orange-500 text-white font-bold text-xl hover:bg-orange-600 active:scale-95 transition-all shadow-md"
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
  const juiceRef  = useRef<JuiceHandle>(null)

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
  const [combo, setCombo]        = useState(0)

  const phaseRef     = useRef<'countdown' | 'playing' | 'ended'>('countdown')
  const targetsRef   = useRef<SlashTarget[]>([])
  const hitCountRef  = useRef(0)
  const missCountRef = useRef(0)
  const bombHitsRef  = useRef(0)
  const scoreRef     = useRef(0)
  const comboRef     = useRef(0)
  const recordsRef   = useRef<HitRecord[]>([])
  const savedRef     = useRef(false)
  const noHandTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spawnRef     = useRef<ReturnType<typeof setInterval> | null>(null)

  // 個人最佳分（僅本機演出用途，正式數據走 saveGameSession/Supabase）
  // hit-stop 依聖經 §5.4 只允許「破紀錄或最終一擊」——用破個人紀錄的那一擊觸發，一場最多一次。
  const bestScoreRef   = useRef(0)
  const recordBrokeRef = useRef(false)
  useEffect(() => {
    try { bestScoreRef.current = Number(localStorage.getItem('slash-fruit-best-score') ?? 0) || 0 } catch { /* noop */ }
  }, [])

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { targetsRef.current = targets }, [targets])

  // 背景 Pose 監測：動作錄製 + 代償偵測（倒數階段收基準線）
  const { hint: poseHint } = usePoseMonitor({
    videoRef, isMirrored,
    active: phase === 'countdown' || phase === 'playing',
  })

  // 場中心流 DDA：滾動命中率調整物件飛行速度（維持 70–80% 甜蜜區）
  const { reportHit, reportMiss, getFactor } = useFlowDda(phase === 'playing')

  useEffect(() => { startCamera('user'); return () => stopCamera() }, []) // eslint-disable-line

  // Speak start prompt once
  const startSpokenRef = useRef(false)
  useEffect(() => {
    if (startSpokenRef.current) return
    startSpokenRef.current = true
    speak('開始囉，加油！')
  }, [])

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) { setPhase('playing'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown])

  // Spawner
  useEffect(() => {
    if (phase !== 'playing') return
    const spawnOne = () => {
      const t = makeTarget(cfg)
      const f = getFactor()   // 場中 DDA：>1 = 更難 = 飛更快
      t.vx *= f; t.vy *= f
      return t
    }
    spawnRef.current = setInterval(() => {
      if (phaseRef.current !== 'playing') return
      setTargets(prev => {
        if (prev.length >= cfg.maxTargets * 2) return prev   // hard cap
        return [...prev, spawnOne()]
      })
    }, cfg.spawnIntervalMs)
    // Spawn first immediately
    setTargets([spawnOne()])
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
    // 更新本機個人最佳分（供下一場的破紀錄 hit-stop 判斷）
    if (scoreRef.current > bestScoreRef.current) {
      try { localStorage.setItem('slash-fruit-best-score', String(scoreRef.current)) } catch { /* noop */ }
    }
    speak(hitCountRef.current >= 8 ? '太棒了，表現很好！' : '辛苦了，下次再加油！')
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
      // 碰到炸彈才中斷連擊（屬於「主動失誤」；漏接飛行目標不算,見 handleExpired 註解）
      comboRef.current = 0
      setCombo(0)
      juiceRef.current?.burst(nx, ny, { colors: ['#616161', '#424242', '#9e9e9e'], emojis: ['💨'], count: 10 })
      juiceRef.current?.floatText(nx, ny - 0.06, '−5', { color: '#ef5350' })
      juiceRef.current?.shake(1)
      // 炸彈不回報 DDA（測的是抑制能力，不是搆取能力）
    } else {
      reportHit()
      feedbackHit()
      hitCountRef.current++
      scoreRef.current += 10
      setHitCount(n => n + 1)
      setScore(scoreRef.current)
      recordsRef.current.push({ nx, ny, reactionMs, type: 'fruit' })

      comboRef.current++
      setCombo(comboRef.current)

      // 爆汁噴濺用水果本色（美術聖經 §1.3／§7 P1），跟目標本體光暈同一顆 id 取色
      const tone = juiceToneForId(id)
      juiceRef.current?.burst(nx, ny, { colors: [tone, '#FFFFFF'], emojis: ['💧', '✨'] })
      juiceRef.current?.slashFlash(nx, ny, { color: tone })
      juiceRef.current?.floatText(nx, ny - 0.06, '+10')
      juiceRef.current?.shake(0.4)

      // Combo 里程碑（每 5 連擊）：只有金色噴發視覺，不做 hit-stop（聖經 §5.4 禁止一般命中頓幀）
      if (comboRef.current >= 5 && comboRef.current % 5 === 0) {
        juiceRef.current?.comboBurst(nx, ny - 0.1, comboRef.current)
      }

      // 破個人紀錄的那一擊：hit-stop＋金字演出（聖經 §5.4 允許的場合，一場最多觸發一次）
      if (!recordBrokeRef.current && bestScoreRef.current > 0 && scoreRef.current > bestScoreRef.current) {
        recordBrokeRef.current = true
        juiceRef.current?.hitStop(100)
        juiceRef.current?.floatText(nx, ny - 0.14, '🏆 新紀錄！', { color: '#FFD600', size: 40 })
      }
    }
  }, [reportHit])

  const handleExpired = useCallback((id: number) => {
    if (phaseRef.current !== 'playing') return
    setTargets(prev => prev.filter(t => t.id !== id))
    missCountRef.current++
    setMissCount(n => n + 1)
    reportMiss()
    // 連擊刻意不因「漏接」中斷——中風患者搆取失敗常是動作限制而非疏忽，
    // 聖經「暖色鼓勵、不懲罰」的精神延伸到這個純視覺演出上；真正的失誤（碰到炸彈）才斷連擊。
  }, [reportMiss])

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
    <div className="w-full h-screen flex flex-col overflow-hidden bg-gray-900 game-play-screen game-theme-orchard">
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
          <div className="text-xs opacity-70">命中 / 失誤</div>
          <div className="text-4xl font-black text-green-400 leading-none">{hitCount}<span className="text-xl text-gray-400">/{missCount}</span></div>
          {bombHits > 0 && <div className="text-sm text-red-400">💣 ×{bombHits}</div>}
        </div>
      </div>

      {/* Camera + canvas */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <OrchardScene />
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

        {/* 代償提醒（聳肩/前傾/側彎） */}
        <CompensationHint hint={poseHint} />

        {/* 命中特效層（粒子/彈跳字/微震） */}
        <JuiceLayer ref={juiceRef} />

        {/* Combo 演出（聖經 §4：亮底場景用陽光金，不用霓虹） */}
        {phase === 'playing' && combo >= 3 && (
          <div
            key={combo}
            className="absolute top-3 left-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-black/55 text-amber-300 font-black text-lg pointer-events-none"
            style={{
              boxShadow: '0 0 18px rgba(255,214,0,0.5)',
              animation: 'comboPulse 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
            }}
          >
            🔥 {combo} 連擊！
          </div>
        )}

        {/* Countdown overlay */}
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
            <p className="text-white text-2xl mb-4 opacity-80">準備好了嗎？</p>
            <div className="text-yellow-400 text-9xl font-black" style={{ textShadow: '0 0 40px rgba(255,214,0,0.7)' }}>
              {countdown > 0 ? countdown : '出發！'}
            </div>
            <p className="text-white text-lg mt-6 opacity-60">伸手觸碰飛過來的水果</p>
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
            命中率 {accuracy}%
          </div>
        )}

        <SceneFront theme="orchard" />
      </div>

      {/* Combo pill 進場關鍵幀（同 whack-mole molePulse 的 inline style 慣例） */}
      <style>{`
        @keyframes comboPulse {
          0%   { transform: translate(-50%, -6px) scale(0.7); opacity: 0; }
          60%  { transform: translate(-50%, 0) scale(1.12); opacity: 1; }
          100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
        }
      `}</style>
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

  const rating = hits >= 25 ? { e: '🏆', t: '太厲害了！', c: '#F57F17' }
    : hits >= 15 ? { e: '🌟', t: '非常好！',   c: '#1565C0' }
    : hits >= 8  ? { e: '👍', t: '做得好！',   c: '#2E7D32' }
    :              { e: '💪', t: '繼續加油！', c: '#6A1B9A' }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-yellow-50 flex flex-col items-center px-5 py-10 gap-6 game-menu-screen game-theme-orchard">
      {/* Rating */}
      <div className="text-center">
        <div className="text-6xl">{rating.e}</div>
        <h1 className="text-4xl font-extrabold mt-2" style={{ color: rating.c }}>{rating.t}</h1>
        <p className="text-gray-500 mt-1">復能切切樂 · {cfg.label} {cfg.sublabel}</p>
      </div>

      {/* Score */}
      <div className="bg-blue-900 rounded-3xl px-16 py-5 text-center shadow-xl">
        <p className="text-blue-200 text-lg">總分</p>
        <p className="text-7xl font-black text-yellow-400 leading-none">{Math.max(0, hits * 10 - bombHits * 5)}</p>
        <p className="text-blue-300 text-base mt-1">分</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {[
          { label: '成功觸碰', value: `${hits} 次`,    color: '#2E7D32' },
          { label: '命中率',   value: `${accuracy}%`, color: '#6A1B9A' },
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
          <p className="font-bold text-gray-700 mb-4">觸碰區域分析</p>

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
          <p className="text-sm text-gray-400 mb-2">觸碰熱區（上＝高位）</p>
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
          <p className="text-xs text-gray-300 text-center mt-2">顏色越深 = 觸碰越多</p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-4 w-full max-w-lg">
        <button onClick={onHome}
          className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg hover:bg-gray-50">
          🏠 換遊戲
        </button>
        <button onClick={onReplay}
          className="flex-[2] py-3 rounded-2xl bg-orange-500 text-white font-bold text-xl hover:bg-orange-600 active:scale-95 transition-all shadow-md">
          🔄 再玩一次
        </button>
      </div>
    </main>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SlashFruitPage() {
  const router = useRouter()

  const [phase,      setPhase]      = useState<Phase>('config')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const { recommended } = useDdaRecommendation('slash-fruit')
  const touchedRef = useRef(false)

  // AI 建議難度：使用者尚未手動選擇時自動預選
  useEffect(() => {
    if (recommended && !touchedRef.current) setDifficulty(recommended)
  }, [recommended])
  const [results,    setResults]    = useState<{
    hits: number; misses: number; bombHits: number; records: HitRecord[]
  } | null>(null)

  const savedRef = useRef(false)

  const handleEnd = useCallback((
    hits: number, misses: number, bombHits: number, records: HitRecord[],
  ) => {
    setResults({ hits, misses, bombHits, records })
    setPhase('ended')

    if (!savedRef.current) {
      savedRef.current = true
      const fruitRecords = records.filter(r => r.type === 'fruit')
      const avgReactionMs = fruitRecords.length > 0
        ? Math.round(fruitRecords.reduce((s, r) => s + r.reactionMs, 0) / fruitRecords.length)
        : null
      void saveGameSession({
        game_type: 'slash-fruit',
        difficulty,
        score: Math.max(0, hits * 10 - bombHits * 5),
        hits,
        misses,
        avg_reaction_ms: avgReactionMs,
        duration_secs: 60,
        ...computeZones(fruitRecords.map(r => ({ nx: r.nx, ny: r.ny }))),
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
      bombHits={results?.bombHits ?? 0}
      records={results?.records ?? []}
      onReplay={() => { setResults(null); setPhase('countdown') }}
      onHome={() => router.push('/')}
    />
  )
}
