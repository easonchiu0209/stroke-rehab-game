'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { useCamera } from '@/hooks/useCamera'
import { usePinchSortDetector, type SortBin, type SortItem } from '@/hooks/usePinchSortDetector'
import { computeZones, takeTrajectory } from '@/lib/saveSession'
import { feedbackHit, feedbackMiss, speak } from '@/lib/feedback'

type Difficulty = 'easy' | 'medium' | 'hard'
type Phase = 'config' | 'playing' | 'ended'
type CatKey = 'red' | 'yellow' | 'green' | 'blue'

const CATS: Record<CatKey, { label: string; color: string; items: string[] }> = {
  red:    { label: '紅色', color: '#ef4444', items: ['🍎', '🍓', '🍅', '🌶️', '🍒'] },
  yellow: { label: '黃色', color: '#f59e0b', items: ['🍌', '🌽', '🍋', '🧀', '🐥'] },
  green:  { label: '綠色', color: '#22c55e', items: ['🥦', '🥝', '🥬', '🍏', '🐸'] },
  blue:   { label: '藍色', color: '#3b82f6', items: ['🫐', '🐟', '🧊', '🌐', '💙'] },
}

interface Cfg {
  label: string; sublabel: string; cats: CatKey[]
  grabRadiusPx: number; visualEm: number; maxItems: number; gameSecs: number
  badge: string; hint: string
}

const CFGS: Record<Difficulty, Cfg> = {
  easy:   { label: 'Level 1', sublabel: '兩種顏色', cats: ['red', 'yellow'], grabRadiusPx: 85, visualEm: 64, maxItems: 1, gameSecs: 60, badge: 'bg-green-100 text-green-800', hint: '捏起物件，拖到同色的籃子放開' },
  medium: { label: 'Level 2', sublabel: '三種顏色', cats: ['red', 'yellow', 'green'], grabRadiusPx: 68, visualEm: 54, maxItems: 2, gameSecs: 60, badge: 'bg-blue-100 text-blue-800', hint: '同時兩個物件，捏起拖到正確顏色籃子' },
  hard:   { label: 'Level 3', sublabel: '四種顏色', cats: ['red', 'yellow', 'green', 'blue'], grabRadiusPx: 54, visualEm: 46, maxItems: 2, gameSecs: 60, badge: 'bg-purple-100 text-purple-800', hint: '四色分類，物件較小，考驗精準捏取' },
}

function binsFor(cfg: Cfg): SortBin[] {
  const n = cfg.cats.length
  return cfg.cats.map((c, i) => ({ category: c, label: CATS[c].label, color: CATS[c].color, cx: (i + 0.5) / n }))
}

let _id = 1
function makeItem(cats: CatKey[]): SortItem {
  const cat = cats[Math.floor(Math.random() * cats.length)]
  const pool = CATS[cat].items
  return {
    id: _id++,
    category: cat,
    emoji: pool[Math.floor(Math.random() * pool.length)],
    nx: 0.14 + Math.random() * 0.72,
    ny: 0.14 + Math.random() * 0.34,
    spawnTime: performance.now(),
  }
}

interface DropRec { nx: number; ny: number; reactionMs: number }

// ── ConfigView ────────────────────────────────────────────────
function ConfigView({ difficulty, setDifficulty, onStart }: {
  difficulty: Difficulty; setDifficulty: (d: Difficulty) => void; onStart: () => void
}) {
  const router = useRouter()
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 flex flex-col items-center px-5 py-10 gap-6">
      <div className="text-center">
        <div className="text-6xl mb-2">🤏</div>
        <h1 className="text-4xl font-extrabold text-gray-900">夾取分類</h1>
        <p className="text-gray-600 mt-1 text-base">用拇指與食指捏起物件，分類到對應顏色的籃子</p>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-500 mb-2">訓練目標</p>
        <div className="flex flex-wrap gap-2">
          {['三指捏握', '指尖精細控制', '手眼協調', '前臂搬運', '放開時機'].map(t => (
            <span key={t} className="px-3 py-1 bg-orange-100 text-orange-800 text-sm font-medium rounded-full">{t}</span>
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
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all bg-white ${selected ? 'border-orange-400 ring-2 ring-orange-200' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{icons[key]}</span>
                  <span className="font-bold text-gray-900">{cfg.label}</span>
                  <span className="font-semibold text-gray-500">{cfg.sublabel}</span>
                  {selected && <span className="ml-auto text-xs font-bold bg-orange-400 text-white px-2 py-0.5 rounded-full">已選</span>}
                </div>
                <p className="text-sm text-gray-500 ml-7">{cfg.hint}</p>
                <div className="flex gap-1.5 ml-7 mt-2">
                  {cfg.cats.map(c => <span key={c} className="w-5 h-5 rounded-full" style={{ background: CATS[c].color }} />)}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex gap-4 w-full max-w-lg">
        <button onClick={() => router.push('/')} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg">← 返回</button>
        <button onClick={onStart} className="flex-[2] py-3 rounded-2xl bg-orange-500 text-white font-extrabold text-xl shadow-lg active:scale-95">開始 →</button>
      </div>
    </main>
  )
}

// ── PlayingView ───────────────────────────────────────────────
function PlayingView({ difficulty, onEnd }: {
  difficulty: Difficulty; onEnd: (hits: number, misses: number, records: DropRec[]) => void
}) {
  const cfg = CFGS[difficulty]
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { landmarker } = useHandLandmarker()
  const { isReady: cameraReady, startCamera, stopCamera, isMirrored } = useCamera(videoRef)
  const isActive = cameraReady && !!landmarker

  const [phase, setPhase] = useState<'countdown' | 'playing' | 'ended'>('countdown')
  const [countdown, setCountdown] = useState(3)
  const [timeLeft, setTimeLeft] = useState(cfg.gameSecs)
  const [score, setScore] = useState(0)
  const [hitCount, setHitCount] = useState(0)
  const [missCount, setMissCount] = useState(0)
  const [items, setItems] = useState<SortItem[]>([])
  const [noHand, setNoHand] = useState(false)

  const phaseRef = useRef<'countdown' | 'playing' | 'ended'>('countdown')
  const hitRef = useRef(0), missRef = useRef(0), scoreRef = useRef(0)
  const recordsRef = useRef<DropRec[]>([])
  const savedRef = useRef(false)
  const startSpokenRef = useRef(false)
  const endSpokenRef = useRef(false)
  const noHandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { startCamera('user'); return () => stopCamera() }, [startCamera, stopCamera])

  useEffect(() => {
    if (phase !== 'countdown') return
    if (!startSpokenRef.current) { startSpokenRef.current = true; speak('準備好，開始分類囉！') }
    if (countdown <= 0) { setPhase('playing'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown])

  useEffect(() => {
    if (phase !== 'playing') return
    setItems(Array.from({ length: cfg.maxItems }, () => makeItem(cfg.cats)))
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
    if (!endSpokenRef.current) {
      endSpokenRef.current = true
      speak(hitRef.current >= 15 ? '太棒了，分類高手！' : '結束囉，做得很好！')
    }
    setTimeout(() => onEnd(hitRef.current, missRef.current, recordsRef.current), 500)
  }, [phase, onEnd])

  const handleSorted = useCallback((id: number, correct: boolean, _bin: string, nx: number, ny: number, reactionMs: number) => {
    if (phaseRef.current !== 'playing') return
    if (correct) {
      feedbackHit()
      hitRef.current++; setHitCount(n => n + 1)
      scoreRef.current += 10; setScore(scoreRef.current)
      recordsRef.current.push({ nx, ny, reactionMs })
      setItems(prev => [...prev.filter(i => i.id !== id), makeItem(cfg.cats)])
    } else {
      feedbackMiss()
      missRef.current++; setMissCount(n => n + 1)
      setItems(prev => prev.map(i => i.id === id
        ? { ...i, nx: 0.14 + Math.random() * 0.72, ny: 0.14 + Math.random() * 0.34, spawnTime: performance.now() }
        : i))
    }
  }, [cfg])

  const { handDetected, setItems: sync } = usePinchSortDetector({
    landmarker, videoRef, canvasRef, isActive, isMirrored,
    bins: binsFor(cfg), grabRadiusPx: cfg.grabRadiusPx, visualEm: cfg.visualEm,
    onSorted: handleSorted, onGrab: () => {},
  })
  useEffect(() => { sync(items) }, [items, sync])

  useEffect(() => {
    if (phase !== 'playing') return
    if (!handDetected) noHandTimer.current = setTimeout(() => setNoHand(true), 3000)
    else { if (noHandTimer.current) clearTimeout(noHandTimer.current); setNoHand(false) }
    return () => { if (noHandTimer.current) clearTimeout(noHandTimer.current) }
  }, [phase, handDetected])

  const total = hitCount + missCount
  const accuracy = total > 0 ? Math.round((hitCount / total) * 100) : 0

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden" style={{ background: '#fff7ed' }}>
      <div className="flex justify-between items-center px-6 py-3 bg-orange-600 text-white shrink-0 z-10">
        <div><div className="text-xs opacity-80">分數</div><div className="text-4xl font-black leading-none">{score}</div></div>
        <div className="text-center">
          {phase === 'countdown' && <div className="text-5xl font-black">{countdown > 0 ? countdown : '開始！'}</div>}
          {phase === 'playing' && (<><div className="text-xs opacity-80">剩餘時間</div><div className={`text-5xl font-black leading-none ${timeLeft <= 10 ? 'text-yellow-300' : ''}`}>{timeLeft}</div></>)}
          {phase === 'ended' && <div className="text-2xl font-bold">結束！</div>}
        </div>
        <div className="text-right"><div className="text-xs opacity-80">分對</div><div className="text-4xl font-black text-yellow-200 leading-none">{hitCount}</div></div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* 桌面背景 */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 18%, #fffaf2, #ffedd5 75%)' }} />
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-0" />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />

        {/* 籃子顏色提示（與 canvas 籃子對齊在底部） */}
        {phase === 'playing' && (
          <div className="absolute left-0 right-0 flex justify-around px-4" style={{ bottom: '3%' }}>
            {cfg.cats.map(c => (
              <span key={c} className="px-3 py-1 rounded-full text-white text-sm font-bold shadow" style={{ background: CATS[c].color }}>{CATS[c].label}</span>
            ))}
          </div>
        )}

        {phase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white">
            <p className="text-2xl mb-3 opacity-90">{cfg.hint}</p>
            <p className="text-9xl font-black text-orange-300">{countdown > 0 ? countdown : '開始！'}</p>
          </div>
        )}
        {noHand && phase === 'playing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white gap-3">
            <p className="text-6xl">👋</p><p className="text-2xl font-semibold">未偵測到手部</p><p className="text-lg opacity-80">請將手放到鏡頭前方</p>
          </div>
        )}
        {phase === 'playing' && total > 0 && (
          <div className="absolute top-3 right-3 bg-black/40 text-white px-3 py-1.5 rounded-xl text-sm font-bold">正確率 {accuracy}%</div>
        )}
      </div>
    </div>
  )
}

// ── ResultsView ───────────────────────────────────────────────
function ResultsView({ difficulty, hits, misses, records, onReplay, onHome }: {
  difficulty: Difficulty; hits: number; misses: number; records: DropRec[]
  onReplay: () => void; onHome: () => void
}) {
  const cfg = CFGS[difficulty]
  const total = hits + misses
  const accuracy = total > 0 ? Math.round((hits / total) * 100) : 0
  const avgRxn = records.length > 0 ? Math.round(records.reduce((s, r) => s + r.reactionMs, 0) / records.length) / 1000 : 0
  const rating = hits >= 25 ? { e: '🏆', t: '分類大師！' } : hits >= 15 ? { e: '🌟', t: '非常好！' } : hits >= 8 ? { e: '👍', t: '做得好！' } : { e: '💪', t: '繼續加油！' }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 flex flex-col items-center px-5 py-10 gap-6">
      <div className="text-center">
        <div className="text-6xl">{rating.e}</div>
        <h1 className="text-4xl font-extrabold mt-2 text-gray-900">{rating.t}</h1>
        <p className="text-gray-600 mt-1">夾取分類 · {cfg.label} {cfg.sublabel}</p>
      </div>
      <div className="bg-orange-500 rounded-3xl px-16 py-5 text-center shadow-xl">
        <p className="text-orange-100 text-lg font-semibold">總分</p>
        <p className="text-7xl font-black text-white leading-none">{hits * 10}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {[
          { label: '分對', value: `${hits}` },
          { label: '正確率', value: `${accuracy}%` },
          { label: '分錯', value: `${misses}` },
          { label: '平均耗時', value: avgRxn > 0 ? `${avgRxn.toFixed(1)} 秒` : '—' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 text-center shadow-sm">
            <p className="text-sm text-gray-500 mb-1">{s.label}</p>
            <p className="text-3xl font-black text-orange-600">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-4 w-full max-w-lg">
        <button onClick={onHome} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg">🏠 首頁</button>
        <button onClick={onReplay} className="flex-[2] py-3 rounded-2xl bg-orange-500 text-white font-extrabold text-xl shadow-lg active:scale-95">🔄 再來一次</button>
      </div>
    </main>
  )
}

// ── Page root ─────────────────────────────────────────────────
export default function PinchSortPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('config')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [results, setResults] = useState<{ hits: number; misses: number; records: DropRec[] } | null>(null)

  const handleEnd = useCallback((hits: number, misses: number, records: DropRec[]) => {
    setResults({ hits, misses, records })
    setPhase('ended')
    fetch('/api/game/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_type: 'pinch-sort', difficulty,
        score: hits * 10, hits, misses,
        avg_reaction_ms: records.length ? Math.round(records.reduce((s, r) => s + r.reactionMs, 0) / records.length) : null,
        duration_secs: CFGS[difficulty].gameSecs,
        ...computeZones(records.map(r => ({ nx: r.nx, ny: r.ny }))),
        trajectory: takeTrajectory(),
      }),
    }).catch(() => {})
  }, [difficulty])

  if (phase === 'config') return <ConfigView difficulty={difficulty} setDifficulty={setDifficulty} onStart={() => setPhase('playing')} />
  if (phase === 'playing') return <PlayingView key={difficulty} difficulty={difficulty} onEnd={handleEnd} />
  return <ResultsView difficulty={difficulty} hits={results?.hits ?? 0} misses={results?.misses ?? 0} records={results?.records ?? []} onReplay={() => { setResults(null); setPhase('playing') }} onHome={() => router.push('/')} />
}
