'use client'

// 復能全壘打（baseball-hit）— moving 機制（GAME-FACTORY §1：沿用 app/slash-fruit 的 useSlashDetector）
// 玩法：第一人稱打擊視角，投手投出不同球種，球以偽 3D（由小變大＋位移軌跡）飛向打擊區，
//       球進入打擊區的時間窗內揮手＝擊中＝轟出全壘打；未擊中＝好球，三振＝溫和換局。
// 復健目標：視覺追蹤與預判、揮擊時機（反應時間）、患側揮臂；球種變化＝認知負荷與反應訓練的難度階梯。
//
// 工程限制（不改 hook 公開介面）：useSlashDetector 的 SlashTarget 只支援「等速位移＋固定重力」的
// 直線拋物線判定，且目標視覺大小（visualEm）為出生時的固定值，無法原生做「彎曲軌跡」或「由小變大」。
// 因此：
//   1) 判定（hit-test）：完全沿用 hook 原生的 x0/vx/y0/vy/gravity 拋物線＋固定半徑，不動 hook。
//   2) 視覺（由小變大＋曲球/蝴蝶球飄忽）：另外在遊戲層用 CSS keyframe 動畫繪出一顆「偽 3D 球」，
//      位置＝hook 匯出的 getTargetPos() 真實物理座標 + 一個「有界」的視覺彎曲偏移（曲球=固定側向漂移
//      +小幅正弦；蝴蝶球=較大正弦飄動），偏移幅度刻意 < 判定半徑，讓玩家對著「看到的彎曲球」揮擊
//      仍會命中，不會有「看跟打不同位置」的不公平感。hook 自己畫的目標圓圈/命中閃光保留但調暗
//      （canvas opacity），只當作手部游標與命中閃光的來源（同 rhythm-drum 手法）。
//   3] 時間窗判定：hook 的 onHit 回傳 reactionMs（命中時刻－出生時刻），遊戲層拿它跟「預期抵達打擊
//      區時間」比對，分類 perfect/good/foul（早/晚仍算安打，不罰），完全在遊戲層自己算（契約允許）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { useCamera } from '@/hooks/useCamera'
import { useSlashDetector, getTargetPos } from '@/hooks/useSlashDetector'
import type { SlashTarget } from '@/hooks/useSlashDetector'
import { saveGameSession, computeZones } from '@/lib/saveSession'
import { usePoseMonitor } from '@/hooks/usePoseMonitor'
import CompensationHint from '@/components/game/CompensationHint'
import JuiceLayer, { type JuiceHandle } from '@/components/game/JuiceLayer'
import { useFlowDda, useDdaRecommendation } from '@/hooks/useFlowDda'
import { feedbackHit, speak } from '@/lib/feedback'
import { SceneBack, SceneFront } from '@/components/game/GameScene'

// ── Types ──────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard'
type Phase      = 'config' | 'countdown' | 'playing' | 'ended'
type BatSide    = 'right' | 'left'
type PitchType  = 'straight' | 'changeup' | 'curveball' | 'knuckleball' | 'fastball'
type Judge      = 'perfect' | 'good' | 'foul'

interface PitchDef {
  name:        string
  gravity:     number             // 下墜加速度（normalized/sec²）
  driftRange?: [number, number]   // 曲球：左右彎曲的側向位移量（功能性，會真的影響判定路徑）
  wobbleAmp?:  number             // 視覺飄忽幅度（僅影響繪圖，< 判定半徑，不影響公平性）
  wobbleFreq?: number
  spinDeg:     number             // 視覺自轉總量（曲球轉得快、蝴蝶球幾乎不轉）
  tint:        string             // 命中特效/光暈點綴色
}

const PITCH_DEFS: Record<PitchType, PitchDef> = {
  straight:    { name: '直球',   gravity: 0.30, spinDeg: 520, tint: '#60A5FA' },
  fastball:    { name: '快速球', gravity: 0.26, spinDeg: 640, tint: '#F87171' },
  changeup:    { name: '變速球', gravity: 0.42, spinDeg: 340, tint: '#FBBF24' },
  curveball:   { name: '曲球',   gravity: 0.55, driftRange: [0.09, 0.13], wobbleAmp: 0.018, wobbleFreq: 1.6, spinDeg: 880, tint: '#A78BFA' },
  knuckleball: { name: '蝴蝶球', gravity: 0.28, wobbleAmp: 0.05, wobbleFreq: 1.9, spinDeg: 35, tint: '#34D399' },
}

interface Cfg {
  label:       string
  sublabel:    string
  gameSecs:    number
  hitRadiusPx: number                          // 640 寬基準的打擊區判定半徑（適老：夠大）
  perfectMs:   number                          // 時機偏差 ≤ 此值＝全壘打
  goodMs:      number                          // ≤ 此值＝安打；再外＝界外球（仍算有效觸擊，不罰）
  gapMs:       number                          // 一球結束到下一球出手的間隔
  flightMs:    Partial<Record<PitchType, number>>   // 該難度可出現的球種與飛行時間
  pool:        PitchType[]                     // 加權亂數池
  badgeColor:  string
}

const CFGS: Record<Difficulty, Cfg> = {
  easy: {
    label: 'Level 1', sublabel: '被動輔助期',
    gameSecs: 60, hitRadiusPx: 100, perfectMs: 260, goodMs: 620, gapMs: 2600,
    flightMs: { straight: 1250, changeup: 1650 },
    pool: ['straight', 'straight', 'changeup'],
    badgeColor: 'bg-green-100 text-green-800',
  },
  medium: {
    label: 'Level 2', sublabel: '主動輔助期',
    gameSecs: 60, hitRadiusPx: 78, perfectMs: 200, goodMs: 480, gapMs: 2000,
    flightMs: { straight: 950, changeup: 1450, curveball: 1050 },
    pool: ['straight', 'straight', 'changeup', 'curveball', 'curveball'],
    badgeColor: 'bg-blue-100 text-blue-800',
  },
  hard: {
    label: 'Level 3', sublabel: '主動控制期',
    gameSecs: 60, hitRadiusPx: 60, perfectMs: 150, goodMs: 380, gapMs: 1500,
    flightMs: { straight: 800, fastball: 520, changeup: 1300, curveball: 900, knuckleball: 1250 },
    pool: ['straight', 'fastball', 'fastball', 'changeup', 'curveball', 'curveball', 'knuckleball'],
    badgeColor: 'bg-purple-100 text-purple-800',
  },
}

// 患側/慣用打擊手：只平移打擊區水平位置（鏡像揮擊方向），不改鏡頭本身鏡像邏輯
const BATTING_X: Record<BatSide, number> = { right: 0.60, left: 0.40 }
const BATTING_Y = 0.74
const RELEASE_X = 0.5
const RELEASE_Y = 0.15

interface PitchMeta {
  type:      PitchType
  flightMs:  number
  battingX:  number   // 含彎曲漂移後，該球實際抵達打擊區的 x
}

interface HitRecord { nx: number; ny: number; offsetMs: number; judge: Judge; type: PitchType }

// ── 原創棒球圖示（inline SVG，無外部檔案依賴）──────────────────────────────
const BASEBALL_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>` +
  `<circle cx='50' cy='50' r='44' fill='white'/>` +
  `<circle cx='50' cy='50' r='44' fill='none' stroke='rgba(0,0,0,0.14)' stroke-width='2'/>` +
  `<path d='M20,18 Q46,50 20,82' stroke='#E11D48' stroke-width='4.5' fill='none' stroke-linecap='round'/>` +
  `<path d='M80,18 Q54,50 80,82' stroke='#E11D48' stroke-width='4.5' fill='none' stroke-linecap='round'/>` +
  `</svg>`
const BASEBALL_SVG_URL = `data:image/svg+xml;utf8,${encodeURIComponent(BASEBALL_SVG)}`

// ── 純函式：出題與視覺曲線 ────────────────────────────────────────────────

function pickPitchType(cfg: Cfg): PitchType {
  const available = new Set(Object.keys(cfg.flightMs))
  const pool = cfg.pool.filter(p => available.has(p))
  return pool[Math.floor(Math.random() * pool.length)]
}

/** 產生一球：判定用的 SlashTarget（沿用 hook 原生拋物線）＋ 視覺用的 meta。 */
function makePitch(cfg: Cfg, battingX: number, speedFactor: number): { target: SlashTarget; meta: PitchMeta } {
  const type = pickPitchType(cfg)
  const def  = PITCH_DEFS[type]
  const baseMs   = cfg.flightMs[type] ?? 1000
  const flightMs = baseMs / speedFactor   // DDA：factor > 1 → 飛更快 → 更難
  const driftSign = Math.random() < 0.5 ? -1 : 1
  const drift = def.driftRange ? driftSign * (def.driftRange[0] + Math.random() * (def.driftRange[1] - def.driftRange[0])) : 0
  const targetX = battingX + drift
  const tSec = flightMs / 1000
  const vx = (targetX - RELEASE_X) / tSec
  const vy = (BATTING_Y - RELEASE_Y - 0.5 * def.gravity * tSec * tSec) / tSec

  const target: SlashTarget = {
    id:          performance.now() + Math.random(),
    x0: RELEASE_X, y0: RELEASE_Y, vx, vy,
    gravity:     def.gravity,
    spawnTime:   performance.now(),
    hitRadiusPx: cfg.hitRadiusPx,
    visualEm:    cfg.hitRadiusPx * 0.85,
    type:        'fruit',
    emoji:       '⚾',
  }
  return { target, meta: { type, flightMs, battingX: targetX } }
}

/** 視覺飄忽偏移（曲球/蝴蝶球專用；純繪圖，不影響判定）。幅度刻意壓在判定半徑之內。 */
function visualWobble(def: PitchDef, tSec: number): number {
  if (!def.wobbleAmp) return 0
  const w = def.wobbleFreq ?? 1.5
  return def.wobbleAmp * Math.sin(tSec * w * Math.PI * 2)
}

/** 用取樣點組出這顆球專屬的 CSS @keyframes：由小變大的偽 3D 飛行＋抵達後續飛一段再淡出。 */
function buildBallKeyframes(target: SlashTarget, meta: PitchMeta, def: PitchDef, keyName: string, cfg: Cfg): string {
  const tailMs  = Math.max(cfg.goodMs + 250, 400)
  const totalMs = meta.flightMs + tailMs
  const stops   = [0, 8, 16, 25, 35, 45, 55, 65, 75, 85, 92, 100]

  const lines = stops.map(pct => {
    const p   = pct / 100
    const t   = p * totalMs
    const pos = getTargetPos(target, target.spawnTime + t)
    const wob = visualWobble(def, t / 1000)
    const nx  = pos.nx + wob
    const ny  = pos.ny

    const pFlight = Math.min(1, t / meta.flightMs)
    let scale: number
    let opacity: number
    if (t <= meta.flightMs) {
      scale = 0.22 + 0.78 * Math.pow(pFlight, 1.6)
      opacity = pct === 0 ? 0 : 1
    } else {
      const tail = Math.min(1, (t - meta.flightMs) / tailMs)
      scale = 1 + 0.15 * tail
      opacity = Math.max(0, 1 - tail * 1.3)
    }
    const rot = pFlight * def.spinDeg + (t > meta.flightMs ? ((t - meta.flightMs) / 1000) * def.spinDeg * 0.25 : 0)

    return `  ${pct}% { left: calc(${(nx * 100).toFixed(2)}% - 50%); top: calc(${(ny * 100).toFixed(2)}% - 50%); transform: scale(${scale.toFixed(3)}) rotate(${rot.toFixed(0)}deg); opacity: ${opacity.toFixed(2)}; }`
  })

  return `@keyframes ${keyName} {\n${lines.join('\n')}\n}`
}

// ── ConfigView ────────────────────────────────────────────────────────────

function ConfigView({
  difficulty, setDifficulty, batSide, setBatSide, onStart, recommended,
}: {
  difficulty:    Difficulty
  setDifficulty: (d: Difficulty) => void
  batSide:       BatSide
  setBatSide:    (b: BatSide) => void
  onStart:       () => void
  recommended:   Difficulty | null
}) {
  const router = useRouter()
  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 to-sky-50 flex flex-col items-center px-5 py-10 gap-6 game-menu-screen game-theme-meadow">
      <div className="text-center">
        <div className="text-6xl mb-2">⚾</div>
        <h1 className="text-4xl font-extrabold text-emerald-900">復能全壘打</h1>
        <p className="text-gray-500 mt-1 text-base">看準投手投來的球，抓對時機揮手擊球，訓練視覺追蹤與揮臂反應</p>
      </div>

      {/* Training goals */}
      <div className="w-full max-w-lg bg-white rounded-2xl border border-emerald-100 p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-500 mb-2">訓練目標</p>
        <div className="flex flex-wrap gap-2">
          {['視覺追蹤與預判', '揮擊時機反應', '肩肘伸展', '患側揮臂', '手眼協調'].map(tag => (
            <span key={tag} className="px-3 py-1 bg-emerald-100 text-emerald-800 text-sm font-medium rounded-full">{tag}</span>
          ))}
        </div>
      </div>

      {/* 打擊慣用側 */}
      <div className="w-full max-w-lg">
        <p className="text-base font-semibold text-gray-700 mb-3">選擇打擊慣用側（可設為患側練習）</p>
        <div className="flex gap-3">
          {(['right', 'left'] as BatSide[]).map(side => (
            <button
              key={side}
              onClick={() => setBatSide(side)}
              className={`flex-1 py-3 rounded-2xl border-2 font-bold text-lg transition-all ${
                batSide === side ? 'border-sky-500 bg-sky-50 text-sky-800' : 'border-gray-200 bg-white text-gray-600 hover:border-sky-300'
              }`}
            >
              {side === 'right' ? '🏏 右打' : '🏏 左打'}
            </button>
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
                  selected ? 'border-emerald-400 bg-emerald-50 shadow-md' : 'border-gray-200 bg-white hover:border-emerald-300'
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
                  {key === 'easy'   && '大打擊區・慢直球與變速球・時間窗寬鬆'}
                  {key === 'medium' && '中打擊區・加入曲球（左右彎）・時間窗適中'}
                  {key === 'hard'   && '小打擊區・加入快速球與蝴蝶球（飄忽）・時間窗較緊'}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-sm text-gray-500 max-w-lg text-center">
        💡 球飛近打擊區時，伸手揮過去讓偵測圓圈碰到球就算擊中。抓得越準轟出全壘打，沒揮到只是好球，不扣分。
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
          className="flex-[2] py-3 rounded-2xl bg-emerald-600 text-white font-bold text-xl hover:bg-emerald-700 active:scale-95 transition-all shadow-md"
        >
          開始訓練 →
        </button>
      </div>
    </main>
  )
}

// ── PlayingView ───────────────────────────────────────────────────────────

function PlayingView({
  difficulty, batSide, onEnd,
}: {
  difficulty: Difficulty
  batSide:    BatSide
  onEnd: (hits: number, misses: number, records: HitRecord[], pitchHits: Partial<Record<PitchType, number>>) => void
}) {
  const cfg = CFGS[difficulty]
  const battingX = BATTING_X[batSide]

  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const juiceRef  = useRef<JuiceHandle>(null)

  const { landmarker }                         = useHandLandmarker()
  const { isReady: cameraReady, startCamera, stopCamera, isMirrored } = useCamera(videoRef)
  const isActive = cameraReady && !!landmarker

  const [phase, setPhase]         = useState<'countdown' | 'playing' | 'ended'>('countdown')
  const [countdown, setCountdown] = useState(3)
  const [timeLeft, setTimeLeft]   = useState(cfg.gameSecs)
  const [score, setScore]         = useState(0)
  const [hitCount, setHitCount]   = useState(0)
  const [missCount, setMissCount] = useState(0)
  const [strikes, setStrikes]     = useState(0)
  const [combo, setCombo]         = useState(0)
  const [targets, setTargets]     = useState<SlashTarget[]>([])
  const [noHand, setNoHand]       = useState(false)
  const [judgeMsg, setJudgeMsg]   = useState<{ text: string; color: string } | null>(null)
  const [inningMsg, setInningMsg] = useState<string | null>(null)

  const phaseRef      = useRef<'countdown' | 'playing' | 'ended'>('countdown')
  const scoreRef      = useRef(0)
  const hitCountRef   = useRef(0)
  const missCountRef  = useRef(0)
  const strikesRef    = useRef(0)
  const comboRef      = useRef(0)
  const recordsRef    = useRef<HitRecord[]>([])
  const pitchHitsRef  = useRef<Partial<Record<PitchType, number>>>({})
  const savedRef      = useRef(false)
  const noHandTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextPitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const judgeTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inningTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ballMetaRef   = useRef(new Map<number, PitchMeta>())

  // 個人最佳分（hit-stop 僅在破紀錄那一擊觸發，聖經 §5.4，一場最多一次）
  const bestScoreRef   = useRef(0)
  const recordBrokeRef = useRef(false)
  useEffect(() => {
    try { bestScoreRef.current = Number(localStorage.getItem('baseball-hit-best-score') ?? 0) || 0 } catch { /* noop */ }
  }, [])

  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => { phaseRef.current = phase }, [phase])

  const { hint: poseHint } = usePoseMonitor({
    videoRef, isMirrored,
    active: phase === 'countdown' || phase === 'playing',
  })

  // 場中心流 DDA：滾動命中率調整飛行速度（維持 70–80% 甜蜜區）
  const { reportHit, reportMiss, getFactor } = useFlowDda(phase === 'playing')

  useEffect(() => { startCamera('user'); return () => stopCamera() }, []) // eslint-disable-line

  const startSpokenRef = useRef(false)
  useEffect(() => {
    if (startSpokenRef.current) return
    startSpokenRef.current = true
    speak('比賽開始，看準球揮出去！')
  }, [])

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) { setPhase('playing'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown])

  const showJudge = useCallback((text: string, color: string) => {
    setJudgeMsg({ text, color })
    if (judgeTimer.current) clearTimeout(judgeTimer.current)
    judgeTimer.current = setTimeout(() => setJudgeMsg(null), 900)
  }, [])

  const showInning = useCallback((text: string) => {
    setInningMsg(text)
    if (inningTimer.current) clearTimeout(inningTimer.current)
    inningTimer.current = setTimeout(() => setInningMsg(null), 2200)
  }, [])

  const spawnPitch = useCallback(() => {
    const { target, meta } = makePitch(cfg, battingX, getFactor())
    ballMetaRef.current.set(target.id, meta)
    setTargets([target])
  }, [cfg, battingX, getFactor])

  const scheduleNext = useCallback(() => {
    if (nextPitchTimer.current) clearTimeout(nextPitchTimer.current)
    nextPitchTimer.current = setTimeout(() => {
      if (phaseRef.current === 'playing') spawnPitch()
    }, cfg.gapMs)
  }, [cfg.gapMs, spawnPitch])

  // 開場投出第一球
  useEffect(() => {
    if (phase !== 'playing') return
    spawnPitch()
    return () => {
      if (nextPitchTimer.current) clearTimeout(nextPitchTimer.current)
    }
  }, [phase]) // eslint-disable-line

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
    if (nextPitchTimer.current) clearTimeout(nextPitchTimer.current)
    if (scoreRef.current > bestScoreRef.current) {
      try { localStorage.setItem('baseball-hit-best-score', String(scoreRef.current)) } catch { /* noop */ }
    }
    speak(hitCountRef.current >= 6 ? '太棒了，打得很好！' : '辛苦了，下次再加油！')
    setTimeout(() => onEnd(hitCountRef.current, missCountRef.current, recordsRef.current, pitchHitsRef.current), 600)
  }, [phase, onEnd])

  const handleHit = useCallback((
    id: number, _type: 'fruit' | 'bomb', reactionMs: number, nx: number, ny: number,
  ) => {
    if (phaseRef.current !== 'playing') return
    const meta = ballMetaRef.current.get(id)
    ballMetaRef.current.delete(id)
    setTargets(prev => prev.filter(t => t.id !== id))
    if (!meta) return

    reportHit()
    feedbackHit()

    const offsetMs = reactionMs - meta.flightMs
    const abs = Math.abs(offsetMs)
    let judge: Judge; let pts: number
    if (abs <= cfg.perfectMs)      { judge = 'perfect'; pts = 25 }
    else if (abs <= cfg.goodMs)    { judge = 'good';    pts = 12 }
    else                           { judge = 'foul';    pts = 5 }

    hitCountRef.current++
    scoreRef.current += pts
    setHitCount(n => n + 1)
    setScore(scoreRef.current)
    pitchHitsRef.current[meta.type] = (pitchHitsRef.current[meta.type] ?? 0) + 1
    recordsRef.current.push({ nx, ny, offsetMs, judge, type: meta.type })

    strikesRef.current = 0   // 打到球＝這輪結束，好球數歸零（簡化版棒球規則，符合長者直覺）
    setStrikes(0)

    comboRef.current++
    setCombo(comboRef.current)

    const tint = PITCH_DEFS[meta.type].tint
    if (judge === 'perfect') {
      showJudge('🎉 全壘打！', '#FFD600')
      juiceRef.current?.burst(nx, ny, { colors: [tint, '#FFD600', '#FFFFFF'], emojis: ['⚾', '✨'], count: 20 })
      juiceRef.current?.floatText(nx, ny - 0.09, '+25', { color: '#FFD600', size: 38 })
    } else if (judge === 'good') {
      showJudge('💥 安打！', '#4ADE80')
      juiceRef.current?.burst(nx, ny, { colors: [tint, '#FFFFFF'], emojis: ['⚾'] })
      juiceRef.current?.floatText(nx, ny - 0.07, '+12', { color: '#FFD600' })
    } else {
      showJudge('界外球，可惜！', '#94A3B8')
      juiceRef.current?.burst(nx, ny, { colors: ['#CBD5E1', '#FFFFFF'], emojis: ['⚾'], count: 10 })
      juiceRef.current?.floatText(nx, ny - 0.07, '+5', { color: '#94A3B8', size: 28 })
    }
    juiceRef.current?.shake(judge === 'perfect' ? 0.6 : 0.4)

    if (comboRef.current >= 3 && comboRef.current % 3 === 0) {
      juiceRef.current?.comboBurst(nx, ny - 0.12, comboRef.current, { color: '#FFD600' })
    }

    if (!recordBrokeRef.current && bestScoreRef.current > 0 && scoreRef.current > bestScoreRef.current) {
      recordBrokeRef.current = true
      juiceRef.current?.hitStop(100)
      juiceRef.current?.floatText(nx, ny - 0.16, '🏆 新紀錄！', { color: '#FFD600', size: 40 })
    }

    scheduleNext()
  }, [cfg, reportHit, showJudge, scheduleNext])

  const handleExpired = useCallback((id: number) => {
    if (phaseRef.current !== 'playing') return
    ballMetaRef.current.delete(id)
    setTargets(prev => prev.filter(t => t.id !== id))
    reportMiss()
    missCountRef.current++
    setMissCount(n => n + 1)
    // 好球不斷連擊（同切切樂的漏接精神：搆取/揮擊失敗常是動作限制而非疏忽，不做懲罰演出）
    strikesRef.current++
    if (strikesRef.current >= 3) {
      strikesRef.current = 0
      setStrikes(0)
      showInning('⚾ 三振，換下一局，繼續加油！')
    } else {
      setStrikes(strikesRef.current)
    }
    scheduleNext()
  }, [reportMiss, showInning, scheduleNext])

  const { handDetected, setTargets: syncDetector } = useSlashDetector({
    landmarker, videoRef, canvasRef, isActive, isMirrored,
    onHit: handleHit, onExpired: handleExpired,
  })

  useEffect(() => { syncDetector(targets) }, [targets, syncDetector])

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

  // unmount 清理殘留 timer
  useEffect(() => () => {
    if (judgeTimer.current) clearTimeout(judgeTimer.current)
    if (inningTimer.current) clearTimeout(inningTimer.current)
  }, [])

  const total    = hitCount + missCount
  const accuracy = total > 0 ? Math.round((hitCount / total) * 100) : 0

  // 當前這顆球的視覺 meta + keyframes（同一時間只有一顆球，成本可忽略）
  const ballVisuals = useMemo(() => {
    return targets.map(t => {
      const meta = ballMetaRef.current.get(t.id)
      if (!meta) return null
      const def = PITCH_DEFS[meta.type]
      const keyName = `pitchFly${Math.round(t.id * 1000) % 1_000_000_000}`
      const kf = buildBallKeyframes(t, meta, def, keyName, cfg)
      const totalMs = meta.flightMs + Math.max(cfg.goodMs + 250, 400)
      return { id: t.id, meta, def, keyName, kf, totalMs }
    }).filter((v): v is NonNullable<typeof v> => v !== null)
  }, [targets, cfg])

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden game-play-screen game-theme-meadow">
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
          <div className="text-xs opacity-70">全壘打數 / 好球</div>
          <div className="text-4xl font-black text-green-400 leading-none">
            {hitCount}<span className="text-xl text-gray-400">/{missCount}</span>
          </div>
          <div className="text-sm mt-0.5">
            {[0, 1, 2].map(i => (
              <span key={i} className={i < strikes ? 'text-amber-400' : 'text-gray-500'}>⚾</span>
            ))}
          </div>
        </div>
      </div>

      {/* Camera + canvas */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <SceneBack theme="calm" />

        {/* 投手丘＋簡易剪影角色（原創 CSS 圖形，投球瞬間揮臂） */}
        <div className="absolute pointer-events-none select-none" style={{ left: '50%', top: '6%', transform: 'translateX(-50%)' }} aria-hidden>
          <div style={{ width: 118, height: 24, borderRadius: '50%', background: 'radial-gradient(circle at 40% 30%, #8a6a45, #5f4529 75%)', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.35))', margin: '0 auto' }} />
          <div style={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', width: 46, height: 58, borderRadius: '46% 46% 40% 40% / 54% 54% 46% 46%', background: 'radial-gradient(circle at 34% 24%, rgba(255,255,255,0.32), transparent 45%), linear-gradient(#3B4A6B,#26314a)' }} />
          <div style={{ position: 'absolute', left: '50%', bottom: 66, transform: 'translateX(-50%)', width: 28, height: 28, borderRadius: '50%', background: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.55), transparent 50%), #F2C08C' }} />
          <div
            key={targets[0]?.id ?? 'idle'}
            style={{
              position: 'absolute', left: '50%', bottom: 52, width: 32, height: 9, borderRadius: 5,
              background: '#3B4A6B', transformOrigin: 'left center',
              animation: phase === 'playing' && !reducedMotion ? 'pitcherWindup 0.55s ease-in-out' : 'none',
            }}
          />
        </div>

        {/* 投手到打擊區的柔和導引走廊 */}
        <div className="absolute pointer-events-none" style={{
          left: 'calc(50% - 44px)', top: '11%', width: 88, height: '58%',
          background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.09))',
          borderRadius: 44,
        }} />

        <video
          ref={videoRef}
          autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: isMirrored ? 'scaleX(-1)' : undefined, opacity: 0 }}
        />
        {/* hook 原生渲染調暗：只借它的手部游標與命中殘影，主視覺由下方偽 3D 球負責 */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ transform: isMirrored ? 'scaleX(-1)' : undefined, opacity: 0.3 }}
        />

        {/* 打擊區標記（呼吸光暈，聖經 §2.3／既有 tailwind target-pulse） */}
        <div
          className="absolute animate-target-pulse pointer-events-none"
          style={{
            left: `calc(${battingX * 100}% - ${cfg.hitRadiusPx * 0.5}px)`,
            top: `calc(${BATTING_Y * 100}% - ${cfg.hitRadiusPx * 0.5}px)`,
            width: cfg.hitRadiusPx, height: cfg.hitRadiusPx,
            borderRadius: '50%',
            border: '3px solid rgba(255,255,255,0.55)',
            background: 'radial-gradient(circle, rgba(255,255,255,0.16), rgba(255,255,255,0.03) 60%, transparent 72%)',
            animationPlayState: reducedMotion ? 'paused' : 'running',
          }}
        />

        {/* 偽 3D 飛行球（由小變大＋曲球/蝴蝶球視覺彎曲） */}
        {ballVisuals.map(({ id, def, keyName, totalMs }) => (
          <div
            key={id}
            className="absolute pointer-events-none"
            style={{ width: cfg.hitRadiusPx * 1.9, height: cfg.hitRadiusPx * 1.9, animation: `${keyName} ${totalMs}ms linear forwards` }}
          >
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              backgroundImage: `url(${BASEBALL_SVG_URL})`, backgroundSize: 'contain',
              filter: `drop-shadow(0 4px 10px rgba(0,0,0,0.4)) drop-shadow(0 0 14px ${def.tint}66)`,
            }} />
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle at 30% 26%, rgba(255,255,255,0.55), transparent 46%)' }} />
          </div>
        ))}

        {/* 代償提醒（聳肩/前傾/側彎） */}
        <CompensationHint hint={poseHint} />

        {/* 命中特效層（粒子/彈跳字/微震） */}
        <JuiceLayer ref={juiceRef} />

        {/* 判定文字（全壘打/安打/界外） */}
        {judgeMsg && phase === 'playing' && (
          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ top: '24%' }}>
            <p className="text-3xl font-black whitespace-nowrap" style={{ color: judgeMsg.color, textShadow: `0 0 16px ${judgeMsg.color}66, 0 2px 4px rgba(0,0,0,0.6)` }}>
              {judgeMsg.text}
            </p>
          </div>
        )}

        {/* 換局提示（三振，溫和不懲罰） */}
        {inningMsg && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-24 pointer-events-none">
            <div className="px-5 py-2.5 rounded-full bg-black/60 text-amber-300 font-bold text-lg whitespace-nowrap">
              {inningMsg}
            </div>
          </div>
        )}

        {/* Combo 演出 */}
        {phase === 'playing' && combo >= 2 && (
          <div
            key={combo}
            className="absolute top-3 left-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-black/55 text-amber-300 font-black text-lg pointer-events-none"
            style={{ boxShadow: '0 0 18px rgba(255,214,0,0.5)', animation: 'comboPulse 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}
          >
            🔥 {combo} 連續安打！
          </div>
        )}

        {/* Countdown overlay */}
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
            <p className="text-white text-2xl mb-4 opacity-80">準備好了嗎？</p>
            <div className="text-yellow-400 text-9xl font-black" style={{ textShadow: '0 0 40px rgba(255,214,0,0.7)' }}>
              {countdown > 0 ? countdown : '出發！'}
            </div>
            <p className="text-white text-lg mt-6 opacity-60">看準球進入打擊區的時機，伸手揮出去</p>
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

        <SceneFront theme="calm" />
      </div>

      <style>{`
        @keyframes comboPulse {
          0%   { transform: translate(-50%, -6px) scale(0.7); opacity: 0; }
          60%  { transform: translate(-50%, 0) scale(1.12); opacity: 1; }
          100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
        }
        @keyframes pitcherWindup {
          0%   { transform: rotate(8deg); }
          40%  { transform: rotate(-95deg); }
          70%  { transform: rotate(38deg); }
          100% { transform: rotate(8deg); }
        }
        ${ballVisuals.map(b => b.kf).join('\n')}
      `}</style>
    </div>
  )
}

// ── ResultsView ───────────────────────────────────────────────────────────

function ResultsView({
  difficulty, batSide, hits, misses, records, pitchHits, onReplay, onHome,
}: {
  difficulty: Difficulty
  batSide:    BatSide
  hits:       number
  misses:     number
  records:    HitRecord[]
  pitchHits:  Partial<Record<PitchType, number>>
  onReplay:   () => void
  onHome:     () => void
}) {
  const cfg      = CFGS[difficulty]
  const total    = hits + misses
  const accuracy = total > 0 ? Math.round((hits / total) * 100) : 0
  const homeRuns = records.filter(r => r.judge === 'perfect').length
  const singles  = records.filter(r => r.judge === 'good').length
  const fouls    = records.filter(r => r.judge === 'foul').length
  const avgOffset = records.length > 0
    ? Math.round(records.reduce((s, r) => s + Math.abs(r.offsetMs), 0) / records.length)
    : 0
  const score = homeRuns * 25 + singles * 12 + fouls * 5

  const zones = computeZones(records.map(r => ({ nx: r.nx, ny: r.ny })))

  const zoneGrid = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, col) => {
      const xMin = col / 3; const xMax = (col + 1) / 3
      const yMin = row / 3; const yMax = (row + 1) / 3
      return records.filter(r => r.nx >= xMin && r.nx < xMax && r.ny >= yMin && r.ny < yMax).length
    })
  )
  const maxZone = Math.max(1, ...zoneGrid.flat())

  const rating = homeRuns >= 8 ? { e: '🏆', t: '全壘打大王！', c: '#F57F17' }
    : hits >= 15 ? { e: '🌟', t: '非常好！',   c: '#1565C0' }
    : hits >= 8  ? { e: '👍', t: '做得好！',   c: '#2E7D32' }
    :              { e: '💪', t: '繼續加油！', c: '#6A1B9A' }

  const pitchOrder: PitchType[] = ['straight', 'fastball', 'changeup', 'curveball', 'knuckleball']

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 to-sky-50 flex flex-col items-center px-5 py-10 gap-6 game-menu-screen game-theme-meadow">
      <div className="text-center">
        <div className="text-6xl">{rating.e}</div>
        <h1 className="text-4xl font-extrabold mt-2" style={{ color: rating.c }}>{rating.t}</h1>
        <p className="text-gray-500 mt-1">復能全壘打 · {cfg.label} {cfg.sublabel} · {batSide === 'right' ? '右打' : '左打'}</p>
      </div>

      {/* Score */}
      <div className="bg-emerald-900 rounded-3xl px-16 py-5 text-center shadow-xl">
        <p className="text-emerald-200 text-lg">總分</p>
        <p className="text-7xl font-black text-yellow-400 leading-none">{score}</p>
        <p className="text-emerald-300 text-base mt-1">分</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {[
          { label: '全壘打', value: `${homeRuns} 支`, color: '#F57F17' },
          { label: '安打',   value: `${singles} 支`, color: '#2E7D32' },
          { label: '命中率', value: `${accuracy}%`,  color: '#6A1B9A' },
          { label: '平均時機偏差', value: avgOffset > 0 ? `${avgOffset} ms` : '—', color: '#1565C0' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 text-center shadow-sm border-2" style={{ borderColor: s.color + '20' }}>
            <p className="text-sm text-gray-500 mb-1">{s.label}</p>
            <p className="text-3xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {fouls > 0 && (
        <div className="w-full max-w-lg bg-gray-50 border border-gray-200 rounded-2xl p-3 text-center">
          <p className="text-gray-600 font-semibold">界外球 {fouls} 次（時機差一點，仍算有效觸擊）</p>
        </div>
      )}

      {/* 各球種命中數 */}
      {Object.values(pitchHits).some(v => (v ?? 0) > 0) && (
        <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="font-bold text-gray-700 mb-4">各球種命中數</p>
          <div className="flex gap-3">
            {pitchOrder.filter(p => cfg.flightMs[p] != null).map(p => {
              const count = pitchHits[p] ?? 0
              return (
                <div key={p} className="flex-1 text-center">
                  <div className="text-sm text-gray-500 mb-1">{PITCH_DEFS[p].name}</div>
                  <div className="text-2xl font-bold" style={{ color: PITCH_DEFS[p].tint }}>{count}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Zone analysis */}
      {records.length > 0 && (
        <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="font-bold text-gray-700 mb-4">揮擊區域分析</p>
          <div className="flex gap-3 items-end mb-5">
            {[
              { label: '左側', count: zones.left_hits, color: '#E65100' },
              { label: '中間', count: zones.center_hits, color: '#1565C0' },
              { label: '右側', count: zones.right_hits, color: '#2E7D32' },
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

          <p className="text-sm text-gray-400 mb-2">揮擊熱區（上＝高位）</p>
          <div className="grid grid-cols-3 gap-1 max-w-[200px] mx-auto">
            {zoneGrid.map((row, ri) => row.map((count, ci) => {
              const intensity = count / maxZone
              return (
                <div key={`${ri}-${ci}`}
                  className="aspect-square rounded-lg flex items-center justify-center text-sm font-bold"
                  style={{
                    background: count > 0 ? `rgba(22,163,74,${0.15 + intensity * 0.75})` : '#F5F5F5',
                    color: intensity > 0.4 ? '#FFF' : '#9E9E9E',
                  }}
                >
                  {count > 0 ? count : ''}
                </div>
              )
            }))}
          </div>
          <p className="text-xs text-gray-300 text-center mt-2">顏色越深 = 揮擊越多</p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-4 w-full max-w-lg">
        <button onClick={onHome}
          className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg hover:bg-gray-50">
          🏠 換遊戲
        </button>
        <button onClick={onReplay}
          className="flex-[2] py-3 rounded-2xl bg-emerald-600 text-white font-bold text-xl hover:bg-emerald-700 active:scale-95 transition-all shadow-md">
          🔄 再玩一次
        </button>
      </div>
    </main>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function BaseballHitPage() {
  const router = useRouter()

  const [phase,      setPhase]      = useState<Phase>('config')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [batSide,    setBatSide]    = useState<BatSide>('right')
  const { recommended } = useDdaRecommendation('baseball-hit')
  const touchedRef = useRef(false)

  useEffect(() => {
    if (recommended && !touchedRef.current) setDifficulty(recommended)
  }, [recommended])

  const [results, setResults] = useState<{
    hits: number; misses: number; records: HitRecord[]; pitchHits: Partial<Record<PitchType, number>>
  } | null>(null)

  const savedRef = useRef(false)

  const handleEnd = useCallback((
    hits: number, misses: number, records: HitRecord[], pitchHits: Partial<Record<PitchType, number>>,
  ) => {
    setResults({ hits, misses, records, pitchHits })
    setPhase('ended')

    if (!savedRef.current) {
      savedRef.current = true
      const homeRuns = records.filter(r => r.judge === 'perfect').length
      const singles  = records.filter(r => r.judge === 'good').length
      const fouls    = records.filter(r => r.judge === 'foul').length
      const score = homeRuns * 25 + singles * 12 + fouls * 5
      const avgOffsetMs = records.length > 0
        ? Math.round(records.reduce((s, r) => s + Math.abs(r.offsetMs), 0) / records.length)
        : null
      void saveGameSession({
        game_type: 'baseball-hit',
        difficulty,
        score,
        hits,
        misses,
        avg_reaction_ms: avgOffsetMs,
        duration_secs: CFGS[difficulty].gameSecs,
        ...computeZones(records.map(r => ({ nx: r.nx, ny: r.ny }))),
      })
    }
  }, [difficulty])

  if (phase === 'config') {
    return (
      <ConfigView
        difficulty={difficulty}
        setDifficulty={(d) => { touchedRef.current = true; setDifficulty(d) }}
        batSide={batSide}
        setBatSide={setBatSide}
        recommended={recommended}
        onStart={() => setPhase('countdown')}
      />
    )
  }

  if (phase === 'countdown' || phase === 'playing') {
    return (
      <PlayingView
        key={`${difficulty}-${batSide}`}
        difficulty={difficulty}
        batSide={batSide}
        onEnd={handleEnd}
      />
    )
  }

  return (
    <ResultsView
      difficulty={difficulty}
      batSide={batSide}
      hits={results?.hits ?? 0}
      misses={results?.misses ?? 0}
      records={results?.records ?? []}
      pitchHits={results?.pitchHits ?? {}}
      onReplay={() => { setResults(null); setPhase('countdown') }}
      onHome={() => router.push('/')}
    />
  )
}
