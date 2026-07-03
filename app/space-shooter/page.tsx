'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { useCamera } from '@/hooks/useCamera'
import { useShooterDetector, type ShooterTarget, type FireMode } from '@/hooks/useShooterDetector'
import { computeZones, takeTrajectory } from '@/lib/saveSession'
import { feedbackHit, feedbackMiss, speak } from '@/lib/feedback'

type Difficulty = 'easy' | 'medium' | 'hard'
type Phase = 'config' | 'countdown' | 'playing' | 'ended'

interface Cfg {
  label: string; sublabel: string; fireMode: FireMode; dwellMs: number
  hitRadiusPx: number; visualEm: number; gameSecs: number
  spawnIntervalMs: number; maxTargets: number
  speedMin: number; speedMax: number; mineChance: number
  badge: string; fireHint: string
}

const CFGS: Record<Difficulty, Cfg> = {
  easy: {
    label: 'Level 1', sublabel: '碰到就擊落', fireMode: 'touch', dwellMs: 0,
    hitRadiusPx: 72, visualEm: 64, gameSecs: 60, spawnIntervalMs: 2200, maxTargets: 1,
    speedMin: 0.10, speedMax: 0.16, mineChance: 0,
    badge: 'bg-green-100 text-green-800', fireHint: '移動手臂，讓準心碰到敵人就擊落',
  },
  medium: {
    label: 'Level 2', sublabel: '瞄準停留發射', fireMode: 'dwell', dwellMs: 650,
    hitRadiusPx: 58, visualEm: 54, gameSecs: 60, spawnIntervalMs: 1700, maxTargets: 2,
    speedMin: 0.13, speedMax: 0.22, mineChance: 0,
    badge: 'bg-blue-100 text-blue-800', fireHint: '把準心對準敵人，停留一下就會發射',
  },
  hard: {
    label: 'Level 3', sublabel: '捏手指發射', fireMode: 'pinch', dwellMs: 0,
    hitRadiusPx: 48, visualEm: 46, gameSecs: 60, spawnIntervalMs: 1300, maxTargets: 3,
    speedMin: 0.16, speedMax: 0.28, mineChance: 0.20,
    badge: 'bg-purple-100 text-purple-800', fireHint: '準心對準敵人，拇指+食指捏一下發射。🛰️友軍別打！',
  },
}

const ENEMIES = ['☄️', '🪨', '👾', '🛸', '🌑', '🦠']

function makeTarget(cfg: Cfg): ShooterTarget {
  const speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin)
  const isMine = Math.random() < cfg.mineChance
  return {
    id: performance.now() + Math.random(),
    x0: 0.12 + Math.random() * 0.76,
    y0: -0.1,
    vx: (Math.random() - 0.5) * 0.12,
    vy: speed,
    spawnTime: performance.now(),
    hitRadiusPx: cfg.hitRadiusPx,
    visualEm: cfg.visualEm,
    type: isMine ? 'mine' : 'enemy',
    emoji: isMine ? '🛰️' : ENEMIES[Math.floor(Math.random() * ENEMIES.length)],
  }
}

interface HitRecord { nx: number; ny: number; reactionMs: number; type: 'enemy' | 'mine' }

// ── ConfigView ────────────────────────────────────────────────
function ConfigView({ difficulty, setDifficulty, onStart }: {
  difficulty: Difficulty; setDifficulty: (d: Difficulty) => void; onStart: () => void
}) {
  const router = useRouter()
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-indigo-950 flex flex-col items-center px-5 py-10 gap-6 text-white">
      <div className="text-center">
        <div className="text-6xl mb-2">🚀</div>
        <h1 className="text-4xl font-extrabold">復能太空射擊</h1>
        <p className="text-indigo-200 mt-1 text-base">移動手臂瞄準，擊落來襲的隕石與外星人</p>
      </div>

      <div className="w-full max-w-lg bg-white/10 rounded-2xl p-4">
        <p className="text-sm font-semibold text-indigo-200 mb-2">訓練目標</p>
        <div className="flex flex-wrap gap-2">
          {['肩外展', '肩屈曲', '手臂瞄準控制', '穩定度', '手指捏合'].map(t => (
            <span key={t} className="px-3 py-1 bg-indigo-500/40 text-white text-sm font-medium rounded-full">{t}</span>
          ))}
        </div>
      </div>

      <div className="w-full max-w-lg">
        <p className="text-base font-semibold mb-3">選擇難度（＝不同開槍方式）</p>
        <div className="flex flex-col gap-3">
          {(Object.entries(CFGS) as [Difficulty, Cfg][]).map(([key, cfg]) => {
            const icons: Record<Difficulty, string> = { easy: '🟢', medium: '🔵', hard: '🟣' }
            const selected = difficulty === key
            return (
              <button key={key} onClick={() => setDifficulty(key)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${selected ? 'border-cyan-400 bg-cyan-400/15' : 'border-white/20 bg-white/5'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{icons[key]}</span>
                  <span className="font-bold">{cfg.label}</span>
                  <span className="font-semibold text-indigo-200">{cfg.sublabel}</span>
                  {selected && <span className="ml-auto text-xs font-bold bg-cyan-400 text-slate-900 px-2 py-0.5 rounded-full">已選</span>}
                </div>
                <p className="text-sm text-indigo-200 ml-7">{cfg.fireHint}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex gap-4 w-full max-w-lg">
        <button onClick={() => router.push('/')} className="flex-1 py-3 rounded-2xl border-2 border-white/30 font-semibold text-lg">← 返回</button>
        <button onClick={onStart} className="flex-[2] py-3 rounded-2xl bg-cyan-500 text-slate-900 font-extrabold text-xl shadow-lg active:scale-95">開始任務 →</button>
      </div>
    </main>
  )
}

// ── PlayingView ───────────────────────────────────────────────
function PlayingView({ difficulty, onEnd }: {
  difficulty: Difficulty
  onEnd: (hits: number, misses: number, mineHits: number, records: HitRecord[]) => void
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
  const [mineHits, setMineHits] = useState(0)
  const [targets, setTargets] = useState<ShooterTarget[]>([])
  const [noHand, setNoHand] = useState(false)

  const phaseRef = useRef<'countdown' | 'playing' | 'ended'>('countdown')
  const hitRef = useRef(0), missRef = useRef(0), mineRef = useRef(0), scoreRef = useRef(0)
  const recordsRef = useRef<HitRecord[]>([])
  const savedRef = useRef(false)
  const startSpokenRef = useRef(false)
  const endSpokenRef = useRef(false)
  const spawnRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const noHandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { startCamera('user'); return () => stopCamera() }, [startCamera, stopCamera])

  useEffect(() => {
    if (phase !== 'countdown') return
    if (!startSpokenRef.current) { startSpokenRef.current = true; speak('準備發射，加油！') }
    if (countdown <= 0) { setPhase('playing'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown])

  useEffect(() => {
    if (phase !== 'playing') return
    spawnRef.current = setInterval(() => {
      if (phaseRef.current !== 'playing') return
      setTargets(prev => prev.length >= cfg.maxTargets * 2 ? prev : [...prev, makeTarget(cfg)])
    }, cfg.spawnIntervalMs)
    setTargets([makeTarget(cfg)])
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
    if (!endSpokenRef.current) {
      endSpokenRef.current = true
      speak(hitRef.current >= 15 ? '太厲害了，任務成功！' : '任務結束，做得很好！')
    }
    if (spawnRef.current) clearInterval(spawnRef.current)
    setTimeout(() => onEnd(hitRef.current, missRef.current, mineRef.current, recordsRef.current), 500)
  }, [phase, onEnd])

  const handleHit = useCallback((id: number, type: 'enemy' | 'mine', reactionMs: number, nx: number, ny: number) => {
    if (phaseRef.current !== 'playing') return
    setTargets(prev => prev.filter(t => t.id !== id))
    if (type === 'mine') {
      feedbackMiss()
      mineRef.current++; setMineHits(n => n + 1)
      scoreRef.current = Math.max(0, scoreRef.current - 5); setScore(scoreRef.current)
    } else {
      feedbackHit()
      hitRef.current++; setHitCount(n => n + 1)
      scoreRef.current += 10; setScore(scoreRef.current)
      recordsRef.current.push({ nx, ny, reactionMs, type: 'enemy' })
    }
  }, [])

  const handleExpired = useCallback((id: number) => {
    if (phaseRef.current !== 'playing') return
    setTargets(prev => {
      const t = prev.find(x => x.id === id)
      if (t && t.type === 'enemy') { missRef.current++; setMissCount(n => n + 1) }
      return prev.filter(x => x.id !== id)
    })
  }, [])

  const { handDetected, setTargets: sync } = useShooterDetector({
    landmarker, videoRef, canvasRef, isActive, isMirrored,
    fireMode: cfg.fireMode, dwellMs: cfg.dwellMs, onHit: handleHit, onExpired: handleExpired,
  })
  useEffect(() => { sync(targets) }, [targets, sync])

  useEffect(() => {
    if (phase !== 'playing') return
    if (!handDetected) noHandTimer.current = setTimeout(() => setNoHand(true), 3000)
    else { if (noHandTimer.current) clearTimeout(noHandTimer.current); setNoHand(false) }
    return () => { if (noHandTimer.current) clearTimeout(noHandTimer.current) }
  }, [phase, handDetected])

  const total = hitCount + missCount
  const accuracy = total > 0 ? Math.round((hitCount / total) * 100) : 0

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden" style={{ background: '#05010f' }}>
      <div className="flex justify-between items-center px-6 py-3 bg-black/60 text-white shrink-0 z-10">
        <div><div className="text-xs opacity-70">分數</div><div className="text-4xl font-black text-cyan-300 leading-none">{score}</div></div>
        <div className="text-center">
          {phase === 'countdown' && <div className="text-6xl font-black">{countdown > 0 ? countdown : '發射！'}</div>}
          {phase === 'playing' && (<><div className="text-xs opacity-70">剩餘時間</div><div className={`text-5xl font-black leading-none ${timeLeft <= 10 ? 'text-red-400' : ''}`}>{timeLeft}</div></>)}
          {phase === 'ended' && <div className="text-2xl font-bold text-cyan-300">任務結束！</div>}
        </div>
        <div className="text-right">
          <div className="text-xs opacity-70">擊落</div>
          <div className="text-4xl font-black text-green-400 leading-none">{hitCount}</div>
          {mineHits > 0 && <div className="text-sm text-red-400">🛰️ ×{mineHits}</div>}
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* 星空背景 */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 30% 20%, #1a1346, #05010f 70%)' }} />
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-0" style={{ transform: isMirrored ? 'scaleX(-1)' : undefined }} />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" style={{ transform: isMirrored ? 'scaleX(-1)' : undefined }} />

        {phase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white">
            <p className="text-2xl mb-3 opacity-80">{cfg.fireHint}</p>
            <p className="text-9xl font-black text-cyan-300" style={{ textShadow: '0 0 40px rgba(70,224,255,0.7)' }}>{countdown > 0 ? countdown : '發射！'}</p>
          </div>
        )}
        {noHand && phase === 'playing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white gap-3">
            <p className="text-6xl">👋</p><p className="text-2xl font-semibold">未偵測到手部</p><p className="text-lg opacity-80">請將手放到鏡頭前方</p>
          </div>
        )}
        {phase === 'playing' && total > 0 && (
          <div className="absolute bottom-4 right-4 bg-black/50 text-white px-3 py-1.5 rounded-xl text-sm font-bold">命中率 {accuracy}%</div>
        )}
      </div>
    </div>
  )
}

// ── ResultsView ───────────────────────────────────────────────
function ResultsView({ difficulty, hits, misses, mineHits, records, onReplay, onHome }: {
  difficulty: Difficulty; hits: number; misses: number; mineHits: number; records: HitRecord[]
  onReplay: () => void; onHome: () => void
}) {
  const cfg = CFGS[difficulty]
  const total = hits + misses
  const accuracy = total > 0 ? Math.round((hits / total) * 100) : 0
  const avgRxn = records.length > 0 ? Math.round(records.reduce((s, r) => s + r.reactionMs, 0) / records.length) : 0
  const rating = hits >= 25 ? { e: '🏆', t: '王牌飛行員！' } : hits >= 15 ? { e: '🌟', t: '非常好！' } : hits >= 8 ? { e: '👍', t: '做得好！' } : { e: '💪', t: '繼續加油！' }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-indigo-950 flex flex-col items-center px-5 py-10 gap-6 text-white">
      <div className="text-center">
        <div className="text-6xl">{rating.e}</div>
        <h1 className="text-4xl font-extrabold mt-2">{rating.t}</h1>
        <p className="text-indigo-200 mt-1">復能太空射擊 · {cfg.label} {cfg.sublabel}</p>
      </div>
      <div className="bg-cyan-500 rounded-3xl px-16 py-5 text-center shadow-xl">
        <p className="text-cyan-900 text-lg font-semibold">總分</p>
        <p className="text-7xl font-black text-white leading-none">{Math.max(0, hits * 10 - mineHits * 5)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {[
          { label: '擊落', value: `${hits}`, },
          { label: '命中率', value: `${accuracy}%` },
          { label: '平均反應', value: avgRxn > 0 ? `${avgRxn} ms` : '—' },
          { label: '誤擊友軍', value: `${mineHits}` },
        ].map(s => (
          <div key={s.label} className="bg-white/10 rounded-2xl p-4 text-center">
            <p className="text-sm text-indigo-200 mb-1">{s.label}</p>
            <p className="text-3xl font-black text-cyan-300">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-4 w-full max-w-lg">
        <button onClick={onHome} className="flex-1 py-3 rounded-2xl border-2 border-white/30 font-semibold text-lg">🏠 首頁</button>
        <button onClick={onReplay} className="flex-[2] py-3 rounded-2xl bg-cyan-500 text-slate-900 font-extrabold text-xl shadow-lg active:scale-95">🔄 再來一次</button>
      </div>
    </main>
  )
}

// ── Page root ─────────────────────────────────────────────────
export default function SpaceShooterPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('config')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [results, setResults] = useState<{ hits: number; misses: number; mineHits: number; records: HitRecord[] } | null>(null)

  const handleEnd = useCallback((hits: number, misses: number, mineHits: number, records: HitRecord[]) => {
    setResults({ hits, misses, mineHits, records })
    setPhase('ended')
    fetch('/api/game/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_type: 'space-shooter', difficulty,
        score: Math.max(0, hits * 10 - mineHits * 5), hits, misses,
        avg_reaction_ms: records.length ? Math.round(records.reduce((s, r) => s + r.reactionMs, 0) / records.length) : null,
        duration_secs: CFGS[difficulty].gameSecs,
        ...computeZones(records.map(r => ({ nx: r.nx, ny: r.ny }))),
        trajectory: takeTrajectory(),
      }),
    }).catch(() => {})
  }, [difficulty])

  if (phase === 'config') return <ConfigView difficulty={difficulty} setDifficulty={setDifficulty} onStart={() => setPhase('countdown')} />
  if (phase === 'countdown' || phase === 'playing') return <PlayingView key={difficulty} difficulty={difficulty} onEnd={handleEnd} />
  return <ResultsView difficulty={difficulty} hits={results?.hits ?? 0} misses={results?.misses ?? 0} mineHits={results?.mineHits ?? 0} records={results?.records ?? []} onReplay={() => { setResults(null); setPhase('countdown') }} onHome={() => router.push('/')} />
}
