'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePoseLandmarker } from '@/hooks/usePoseLandmarker'
import { useCamera } from '@/hooks/useCamera'
import { usePoseShiftDetector, type ShiftItem } from '@/hooks/usePoseShiftDetector'
import { computeZones, takeTrajectory } from '@/lib/saveSession'
import { feedbackHit, feedbackMiss, speak } from '@/lib/feedback'

type Difficulty = 'easy' | 'medium' | 'hard'
type Phase = 'config' | 'playing' | 'ended'

interface Cfg {
  label: string; sublabel: string; gain: number; catchHalfW: number
  vy: number; spawnMs: number; laneMin: number; laneMax: number
  badChance: number; visualEm: number; maxItems: number; gameSecs: number; hint: string
}

const CFGS: Record<Difficulty, Cfg> = {
  easy:   { label: 'Level 1', sublabel: '小幅重心轉移', gain: 3.0, catchHalfW: 0.17, vy: 0.17, spawnMs: 2300, laneMin: 0.30, laneMax: 0.70, badChance: 0, visualEm: 58, maxItems: 2, gameSecs: 60, hint: '輕輕把重心移到左右，接住掉下來的水果' },
  medium: { label: 'Level 2', sublabel: '較大重心轉移', gain: 3.2, catchHalfW: 0.13, vy: 0.23, spawnMs: 1800, laneMin: 0.18, laneMax: 0.82, badChance: 0, visualEm: 52, maxItems: 2, gameSecs: 60, hint: '左右移動重心，接住兩側的水果' },
  hard:   { label: 'Level 3', sublabel: '大幅轉移＋閃避', gain: 3.4, catchHalfW: 0.11, vy: 0.29, spawnMs: 1500, laneMin: 0.12, laneMax: 0.88, badChance: 0.28, visualEm: 46, maxItems: 3, gameSecs: 60, hint: '接住水果🍎，避開炸彈💣（不要移過去）' },
}

const GOOD = ['🍎', '🍊', '🍐', '🍇', '🫐', '⭐', '🍓']
const BAD = ['💣', '🦠']

let _id = 1
function makeItem(cfg: Cfg): ShiftItem {
  const good = Math.random() >= cfg.badChance
  return {
    id: _id++,
    x: cfg.laneMin + Math.random() * (cfg.laneMax - cfg.laneMin),
    y0: -0.08,
    vy: cfg.vy * (0.9 + Math.random() * 0.2),
    spawnTime: performance.now(),
    good,
    emoji: good ? GOOD[Math.floor(Math.random() * GOOD.length)] : BAD[Math.floor(Math.random() * BAD.length)],
    visualEm: cfg.visualEm,
  }
}

interface CatchRec { nx: number; ny: number }

// ── ConfigView ────────────────────────────────────────────────
function ConfigView({ difficulty, setDifficulty, onStart }: {
  difficulty: Difficulty; setDifficulty: (d: Difficulty) => void; onStart: () => void
}) {
  const router = useRouter()
  const [ack, setAck] = useState(false)
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-cyan-100 flex flex-col items-center px-5 py-10 gap-6">
      <div className="text-center">
        <div className="text-6xl mb-2">⚖️</div>
        <h1 className="text-4xl font-extrabold text-gray-900">重心平衡</h1>
        <p className="text-gray-600 mt-1 text-base">站著左右轉移重心，控制接籃接住掉落的水果</p>
      </div>

      {/* 安全須知 */}
      <div className="w-full max-w-lg bg-red-50 border-2 border-red-200 rounded-2xl p-4">
        <p className="font-bold text-red-700 mb-2">⚠️ 安全須知（站立訓練）</p>
        <ul className="text-sm text-red-700 space-y-1 list-disc pl-5">
          <li>身旁準備穩固的<b>椅子或扶手</b>，隨時可扶</li>
          <li>建議<b>有人陪同</b>在旁，避免跌倒</li>
          <li>清出周圍空間，地面防滑、不要有障礙物</li>
          <li>只需<b>小幅度</b>左右移重心，<b>不用跨步或踮腳</b>；頭暈立即停止並坐下</li>
        </ul>
        <label className="flex items-center gap-2 mt-3 text-sm font-semibold text-red-800">
          <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="w-5 h-5 accent-red-500" />
          我已確認以上安全措施
        </label>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-500 mb-2">訓練目標</p>
        <div className="flex flex-wrap gap-2">
          {['站姿平衡', '重心轉移', '患側負重', '軀幹控制', '預期性姿勢調整'].map(t => (
            <span key={t} className="px-3 py-1 bg-cyan-100 text-cyan-800 text-sm font-medium rounded-full">{t}</span>
          ))}
        </div>
      </div>

      <div className="w-full max-w-lg">
        <p className="text-base font-semibold mb-3 text-gray-800">選擇難度</p>
        <div className="flex flex-col gap-3">
          {(Object.entries(CFGS) as [Difficulty, Cfg][]).map(([key, cfg]) => {
            const icons: Record<Difficulty, string> = { easy: '🟢', medium: '🔵', hard: '🟣' }
            const selected = difficulty === key
            return (
              <button key={key} onClick={() => setDifficulty(key)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all bg-white ${selected ? 'border-cyan-400 ring-2 ring-cyan-200' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{icons[key]}</span>
                  <span className="font-bold text-gray-900">{cfg.label}</span>
                  <span className="font-semibold text-gray-500">{cfg.sublabel}</span>
                  {selected && <span className="ml-auto text-xs font-bold bg-cyan-400 text-white px-2 py-0.5 rounded-full">已選</span>}
                </div>
                <p className="text-sm text-gray-500 ml-7">{cfg.hint}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex gap-4 w-full max-w-lg">
        <button onClick={() => router.push('/')} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg">← 返回</button>
        <button onClick={onStart} disabled={!ack}
          className={`flex-[2] py-3 rounded-2xl font-extrabold text-xl shadow-lg ${ack ? 'bg-cyan-500 text-white active:scale-95' : 'bg-gray-200 text-gray-400'}`}>
          開始 →
        </button>
      </div>
    </main>
  )
}

// ── PlayingView ───────────────────────────────────────────────
function PlayingView({ difficulty, onEnd }: {
  difficulty: Difficulty; onEnd: (hits: number, misses: number, badHits: number, records: CatchRec[]) => void
}) {
  const cfg = CFGS[difficulty]
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { landmarker } = usePoseLandmarker()
  const { isReady: cameraReady, startCamera, stopCamera, isMirrored } = useCamera(videoRef)
  const isActive = cameraReady && !!landmarker

  const [phase, setPhase] = useState<'countdown' | 'playing' | 'ended'>('countdown')
  const [countdown, setCountdown] = useState(5)
  const [timeLeft, setTimeLeft] = useState(cfg.gameSecs)
  const [score, setScore] = useState(0)
  const [hitCount, setHitCount] = useState(0)
  const [missCount, setMissCount] = useState(0)
  const [badHits, setBadHits] = useState(0)
  const [items, setItems] = useState<ShiftItem[]>([])
  const [noBody, setNoBody] = useState(false)

  const phaseRef = useRef<'countdown' | 'playing' | 'ended'>('countdown')
  const hitRef = useRef(0), missRef = useRef(0), badRef = useRef(0), scoreRef = useRef(0)
  const recordsRef = useRef<CatchRec[]>([])
  const savedRef = useRef(false)
  const startSpokenRef = useRef(false)
  const endSpokenRef = useRef(false)
  const spawnRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const noBodyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { startCamera('user'); return () => stopCamera() }, [startCamera, stopCamera])

  useEffect(() => {
    if (phase !== 'countdown') return
    if (!startSpokenRef.current) { startSpokenRef.current = true; speak('請後退到全身入鏡，站到正中間站好') }
    if (countdown <= 0) { setPhase('playing'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown])

  const handleCaught = useCallback((id: number, good: boolean, nx: number) => {
    if (phaseRef.current !== 'playing') return
    setItems(prev => prev.filter(i => i.id !== id))
    if (good) {
      feedbackHit()
      hitRef.current++; setHitCount(n => n + 1)
      scoreRef.current += 10; setScore(scoreRef.current)
      recordsRef.current.push({ nx, ny: 0.85 })
    } else {
      feedbackMiss()
      badRef.current++; setBadHits(n => n + 1)
      scoreRef.current = Math.max(0, scoreRef.current - 5); setScore(scoreRef.current)
    }
  }, [])

  const handleMissed = useCallback((id: number, good: boolean) => {
    if (phaseRef.current !== 'playing') return
    setItems(prev => prev.filter(i => i.id !== id))
    if (good) { missRef.current++; setMissCount(n => n + 1) }
  }, [])

  const { bodyDetected, setItems: sync, calibrate } = usePoseShiftDetector({
    landmarker, videoRef, canvasRef, isActive, isMirrored,
    gain: cfg.gain, catchHalfW: cfg.catchHalfW, avatarEmoji: '🧺',
    onCaught: handleCaught, onMissed: handleMissed,
  })
  useEffect(() => { sync(items) }, [items, sync])

  // 倒數結束→開始時，把當下重心設為中立點
  useEffect(() => { if (phase === 'playing') calibrate() }, [phase, calibrate])

  useEffect(() => {
    if (phase !== 'playing') return
    spawnRef.current = setInterval(() => {
      if (phaseRef.current !== 'playing') return
      setItems(prev => prev.length >= cfg.maxItems ? prev : [...prev, makeItem(cfg)])
    }, cfg.spawnMs)
    setItems([makeItem(cfg)])
    return () => { if (spawnRef.current) clearInterval(spawnRef.current) }
  }, [phase, cfg])

  useEffect(() => {
    if (phase !== 'playing') return
    if (timeLeft <= 0) { setPhase('ended'); return }
    const t = setTimeout(() => setTimeLeft(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, timeLeft])

  useEffect(() => {
    if (phase !== 'ended' || savedRef.current) return
    savedRef.current = true
    if (!endSpokenRef.current) { endSpokenRef.current = true; speak(hitRef.current >= 15 ? '太棒了，平衡控制很好！' : '結束囉，做得很好！') }
    if (spawnRef.current) clearInterval(spawnRef.current)
    setTimeout(() => onEnd(hitRef.current, missRef.current, badRef.current, recordsRef.current), 500)
  }, [phase, onEnd])

  useEffect(() => {
    if (phase !== 'playing') return
    if (!bodyDetected) noBodyTimer.current = setTimeout(() => setNoBody(true), 3000)
    else { if (noBodyTimer.current) clearTimeout(noBodyTimer.current); setNoBody(false) }
    return () => { if (noBodyTimer.current) clearTimeout(noBodyTimer.current) }
  }, [phase, bodyDetected])

  const total = hitCount + missCount
  const accuracy = total > 0 ? Math.round((hitCount / total) * 100) : 0

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden" style={{ background: '#082f49' }}>
      <div className="flex justify-between items-center px-6 py-3 bg-cyan-700 text-white shrink-0 z-10">
        <div><div className="text-xs opacity-80">分數</div><div className="text-4xl font-black leading-none">{score}</div></div>
        <div className="text-center">
          {phase === 'countdown' && <div className="text-4xl font-black">{countdown > 0 ? countdown : '開始！'}</div>}
          {phase === 'playing' && (<><div className="text-xs opacity-80">剩餘時間</div><div className={`text-5xl font-black leading-none ${timeLeft <= 10 ? 'text-yellow-300' : ''}`}>{timeLeft}</div></>)}
          {phase === 'ended' && <div className="text-2xl font-bold">結束！</div>}
        </div>
        <div className="text-right"><div className="text-xs opacity-80">接到</div><div className="text-4xl font-black text-green-300 leading-none">{hitCount}</div>{badHits > 0 && <div className="text-sm text-red-300">💣 ×{badHits}</div>}</div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 12%, #0e4a6b, #082f49 75%)' }} />
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-0" />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />

        {phase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 text-white px-8 text-center">
            <p className="text-5xl mb-4">🧍</p>
            <p className="text-2xl mb-2 font-semibold">請後退讓<b>全身入鏡</b></p>
            <p className="text-lg opacity-85 mb-4">站到畫面正中間、雙腳站穩，椅子放手邊</p>
            <p className="text-8xl font-black text-cyan-300">{countdown > 0 ? countdown : '開始！'}</p>
          </div>
        )}
        {noBody && phase === 'playing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 text-white gap-3 px-8 text-center">
            <p className="text-6xl">🧍</p><p className="text-2xl font-semibold">看不到全身</p><p className="text-lg opacity-80">請後退，讓頭到髖部都進入畫面</p>
          </div>
        )}
        {phase === 'playing' && total > 0 && (
          <div className="absolute top-3 right-3 bg-black/40 text-white px-3 py-1.5 rounded-xl text-sm font-bold">接取率 {accuracy}%</div>
        )}
      </div>
    </div>
  )
}

// ── ResultsView ───────────────────────────────────────────────
function ResultsView({ difficulty, hits, misses, badHits, records, onReplay, onHome }: {
  difficulty: Difficulty; hits: number; misses: number; badHits: number; records: CatchRec[]
  onReplay: () => void; onHome: () => void
}) {
  const cfg = CFGS[difficulty]
  const total = hits + misses
  const accuracy = total > 0 ? Math.round((hits / total) * 100) : 0
  const zones = computeZones(records.map(r => ({ nx: r.nx, ny: r.ny })))
  const leftR = zones.left_hits, rightR = zones.right_hits, centerR = zones.center_hits
  const rating = hits >= 25 ? { e: '🏆', t: '平衡大師！' } : hits >= 15 ? { e: '🌟', t: '非常好！' } : hits >= 8 ? { e: '👍', t: '做得好！' } : { e: '💪', t: '繼續加油！' }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-cyan-100 flex flex-col items-center px-5 py-10 gap-6">
      <div className="text-center">
        <div className="text-6xl">{rating.e}</div>
        <h1 className="text-4xl font-extrabold mt-2 text-gray-900">{rating.t}</h1>
        <p className="text-gray-600 mt-1">重心平衡 · {cfg.label} {cfg.sublabel}</p>
      </div>
      <div className="bg-cyan-500 rounded-3xl px-16 py-5 text-center shadow-xl">
        <p className="text-cyan-100 text-lg font-semibold">總分</p>
        <p className="text-7xl font-black text-white leading-none">{Math.max(0, hits * 10 - badHits * 5)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {[
          { label: '接到', value: `${hits}` },
          { label: '接取率', value: `${accuracy}%` },
          { label: '左側 / 右側', value: `${leftR} / ${rightR}` },
          { label: '中間', value: `${centerR}` },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 text-center shadow-sm">
            <p className="text-sm text-gray-500 mb-1">{s.label}</p>
            <p className="text-3xl font-black text-cyan-600">{s.value}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-gray-500 max-w-lg text-center">左右接取數可看出兩側重心轉移是否對稱，協助觀察患側負重。</p>
      <div className="flex gap-4 w-full max-w-lg">
        <button onClick={onHome} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg">🏠 首頁</button>
        <button onClick={onReplay} className="flex-[2] py-3 rounded-2xl bg-cyan-500 text-white font-extrabold text-xl shadow-lg active:scale-95">🔄 再來一次</button>
      </div>
    </main>
  )
}

// ── Page root ─────────────────────────────────────────────────
export default function BalanceShiftPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('config')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [results, setResults] = useState<{ hits: number; misses: number; badHits: number; records: CatchRec[] } | null>(null)

  const handleEnd = useCallback((hits: number, misses: number, badHits: number, records: CatchRec[]) => {
    setResults({ hits, misses, badHits, records })
    setPhase('ended')
    fetch('/api/game/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_type: 'balance-shift', difficulty,
        score: Math.max(0, hits * 10 - badHits * 5), hits, misses,
        duration_secs: CFGS[difficulty].gameSecs,
        ...computeZones(records.map(r => ({ nx: r.nx, ny: r.ny }))),
        trajectory: takeTrajectory(),
      }),
    }).catch(() => {})
  }, [difficulty])

  if (phase === 'config') return <ConfigView difficulty={difficulty} setDifficulty={setDifficulty} onStart={() => setPhase('playing')} />
  if (phase === 'playing') return <PlayingView key={difficulty} difficulty={difficulty} onEnd={handleEnd} />
  return <ResultsView difficulty={difficulty} hits={results?.hits ?? 0} misses={results?.misses ?? 0} badHits={results?.badHits ?? 0} records={results?.records ?? []} onReplay={() => { setResults(null); setPhase('playing') }} onHome={() => router.push('/')} />
}
