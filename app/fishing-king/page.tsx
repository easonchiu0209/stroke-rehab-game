'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { useCamera } from '@/hooks/useCamera'
import { useMoleDetector, type MoleTarget } from '@/hooks/useMoleDetector'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { saveGameSession, computeZones } from '@/lib/saveSession'
import { feedbackHit, speak } from '@/lib/feedback'

type Difficulty = 'easy' | 'medium' | 'hard'
type GamePhase  = 'countdown' | 'playing' | 'ended'
type PagePhase  = 'config' | 'playing' | 'results'

interface Cfg {
  label: string; sublabel: string; hitRadiusPx: number; displayMs: number; gameSecs: number
  spawnArea: { xMin: number; xMax: number; yMin: number; yMax: number }
}
// 目標偏「下方」→ 引導向下/前伸搆取
const CFGS: Record<Difficulty, Cfg> = {
  easy:   { label: 'Level 1', sublabel: '被動輔助期', hitRadiusPx: 76, displayMs: 4000, gameSecs: 60, spawnArea: { xMin: 0.22, xMax: 0.78, yMin: 0.45, yMax: 0.88 } },
  medium: { label: 'Level 2', sublabel: '主動輔助期', hitRadiusPx: 56, displayMs: 2600, gameSecs: 60, spawnArea: { xMin: 0.12, xMax: 0.88, yMin: 0.40, yMax: 0.92 } },
  hard:   { label: 'Level 3', sublabel: '主動控制期', hitRadiusPx: 40, displayMs: 1600, gameSecs: 60, spawnArea: { xMin: 0.06, xMax: 0.94, yMin: 0.35, yMax: 0.94 } },
}

const FISH = ['🐟', '🐠', '🐡', '🦐', '🦀', '🦑', '🐙', '🦞']

interface FishMole extends MoleTarget { expireAt: number; cssRadius: number; emoji: string }
interface HitRecord { nx: number; ny: number; reactionMs: number; success: boolean }
interface GameResults { hits: number; misses: number; hitRecords: HitRecord[]; difficulty: Difficulty }

function PlayingView({ cfg, difficulty, landmarker, isLandmarkerLoading, landmarkerError, onGameEnd }: {
  cfg: Cfg; difficulty: Difficulty; landmarker: HandLandmarker | null
  isLandmarkerLoading: boolean; landmarkerError: string | null; onGameEnd: (r: GameResults) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const { isReady, error: cameraError, startCamera, stopCamera, isMirrored } = useCamera(videoRef)

  const [gamePhase, setGamePhase] = useState<GamePhase>('countdown')
  const [countdown, setCountdown] = useState(3)
  const [timeLeft, setTimeLeft] = useState(cfg.gameSecs)
  const [hitCount, setHitCount] = useState(0)
  const [moles, setMolesState] = useState<FishMole[]>([])
  const [hitMoleIds, setHitMoleIds] = useState<Set<number>>(new Set())
  const [noHandWarn, setNoHandWarn] = useState(false)

  const gamePhaseRef = useRef<GamePhase>('countdown')
  const hitCountRef = useRef(0), missCountRef = useRef(0)
  const hitRecordsRef = useRef<HitRecord[]>([])
  const savedRef = useRef(false)
  const moleTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const noHandWarnRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { gamePhaseRef.current = gamePhase }, [gamePhase])
  useEffect(() => { startCamera('user'); return () => stopCamera() }, [startCamera, stopCamera])

  const isDetectorActive = gamePhase === 'playing' && isReady && landmarker !== null && !isLandmarkerLoading && !landmarkerError

  const handleHit = useCallback((moleId: number, reactionMs: number) => {
    if (gamePhaseRef.current !== 'playing') return
    const t = moleTimersRef.current.get(moleId)
    if (t) { clearTimeout(t); moleTimersRef.current.delete(moleId) }
    feedbackHit()
    hitCountRef.current += 1
    setHitCount(n => n + 1)
    setHitMoleIds(prev => new Set(prev).add(moleId))
    setMolesState(prev => {
      const m = prev.find(x => x.id === moleId)
      if (m) hitRecordsRef.current.push({ nx: m.nx, ny: m.ny, reactionMs, success: true })
      return prev
    })
    setTimeout(() => {
      setMolesState(prev => prev.filter(m => m.id !== moleId))
      setHitMoleIds(prev => { const s = new Set(prev); s.delete(moleId); return s })
      setTimeout(() => spawnRef.current(), 300)
    }, 280)
  }, [])

  const { handDetected, handNxDisplay, handNy, setMoles: syncDetector } = useMoleDetector({
    landmarker, videoRef, canvasRef, isActive: isDetectorActive, hitRadiusPx: cfg.hitRadiusPx + 20, isMirrored, onHit: handleHit,
  })
  useEffect(() => { syncDetector(moles) }, [moles, syncDetector])

  const spawn = useCallback(() => {
    if (gamePhaseRef.current !== 'playing') return
    if (!areaRef.current) return
    const { xMin, xMax, yMin, yMax } = cfg.spawnArea
    const cssR = cfg.hitRadiusPx * 1.1
    const nx = xMin + Math.random() * (xMax - xMin)
    const ny = yMin + Math.random() * (yMax - yMin)
    const id = performance.now() + Math.random() * 100000
    const now = performance.now()
    const mole: FishMole = { id, nx, ny, spawnTime: now, expireAt: now + cfg.displayMs, cssRadius: cssR, emoji: FISH[Math.floor(Math.random() * FISH.length)] }
    setMolesState(prev => [...prev, mole])
    const timer = setTimeout(() => {
      moleTimersRef.current.delete(id)
      if (gamePhaseRef.current !== 'playing') return
      missCountRef.current += 1
      hitRecordsRef.current.push({ nx, ny, reactionMs: cfg.displayMs, success: false })
      setMolesState(prev => prev.filter(m => m.id !== id))
      setTimeout(() => spawnRef.current(), 400)
    }, cfg.displayMs)
    moleTimersRef.current.set(id, timer)
  }, [cfg])
  const spawnRef = useRef(spawn)
  useEffect(() => { spawnRef.current = spawn }, [spawn])

  useEffect(() => {
    if (gamePhase !== 'countdown') return
    if (countdown <= 0) { speak('開始囉，加油！'); setGamePhase('playing'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [gamePhase, countdown])

  useEffect(() => {
    if (gamePhase !== 'playing') return
    if (timeLeft <= 0) { setGamePhase('ended'); return }
    const t = setTimeout(() => setTimeLeft(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [gamePhase, timeLeft])

  useEffect(() => { if (gamePhase === 'playing') spawnRef.current() }, [gamePhase])

  useEffect(() => {
    if (gamePhase !== 'ended' || savedRef.current) return
    savedRef.current = true
    moleTimersRef.current.forEach(t => clearTimeout(t)); moleTimersRef.current.clear()
    onGameEnd({ hits: hitCountRef.current, misses: missCountRef.current, hitRecords: hitRecordsRef.current, difficulty })
  }, [gamePhase, difficulty, onGameEnd])

  useEffect(() => {
    if (gamePhase !== 'playing') return
    if (!handDetected) noHandWarnRef.current = setTimeout(() => setNoHandWarn(true), 3000)
    else { if (noHandWarnRef.current) clearTimeout(noHandWarnRef.current); setNoHandWarn(false) }
    return () => { if (noHandWarnRef.current) clearTimeout(noHandWarnRef.current) }
  }, [gamePhase, handDetected])

  const hasError = !!(cameraError || landmarkerError)
  const isLoading = !isReady || isLandmarkerLoading
  const cssRadiusPx = cfg.hitRadiusPx * 1.1

  return (
    <div className="flex flex-col w-full h-screen overflow-hidden select-none game-play-screen game-theme-aqua" style={{ background: '#06243f' }}>
      <div className="flex items-center justify-between px-5 py-2.5 bg-black/50 text-white shrink-0">
        <div><p className="text-xs opacity-60">分數</p><p className="text-4xl font-black text-cyan-300 leading-none">{hitCount * 10}</p></div>
        <div className="text-center">
          {gamePhase === 'countdown' && <p className="text-6xl font-black">{countdown > 0 ? countdown : '開始！'}</p>}
          {gamePhase === 'playing' && (<><p className="text-xs opacity-60">剩餘時間</p><p className={`text-5xl font-black leading-none ${timeLeft <= 10 ? 'text-red-400' : ''}`}>{timeLeft}</p></>)}
          {gamePhase === 'ended' && <p className="text-2xl font-bold text-cyan-300">收竿！</p>}
        </div>
        <div className="text-right"><p className="text-xs opacity-60">釣到</p><p className="text-4xl font-black text-green-400 leading-none">{hitCount}</p></div>
      </div>

      <div ref={areaRef} className="relative flex-1 overflow-hidden">
        {/* 海水背景 */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(#1b4e7a, #06243f 75%)' }} />
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-0" style={{ transform: isMirrored ? 'scaleX(-1)' : undefined }} />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ transform: isMirrored ? 'scaleX(-1)' : undefined }} />
        {/* 水面波紋 */}
        <div className="absolute inset-x-0 top-0 h-10 pointer-events-none" style={{ background: 'linear-gradient(rgba(173,216,230,0.35), transparent)' }} />

        {moles.map(mole => {
          const isHit = hitMoleIds.has(mole.id)
          return (
            <div key={mole.id} className="absolute pointer-events-none flex items-center justify-center" style={{
              left: `calc(${mole.nx * 100}% - ${cssRadiusPx}px)`, top: `calc(${mole.ny * 100}% - ${cssRadiusPx}px)`,
              width: cssRadiusPx * 2, height: cssRadiusPx * 2, borderRadius: '50%',
              background: isHit ? 'radial-gradient(circle, #FFD600, #FF6F00)' : 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.9), rgba(120,200,255,0.65) 45%, rgba(30,130,200,0.55) 100%)',
              border: '4px solid rgba(255,255,255,0.85)',
              boxShadow: isHit ? '0 0 50px rgba(255,214,0,1)' : '0 4px 18px rgba(0,0,0,0.4)',
              transform: isHit ? 'scale(1.5)' : 'scale(1)', opacity: isHit ? 0 : 1,
              transition: isHit ? 'transform 0.25s ease-out, opacity 0.25s' : 'none',
              animation: isHit ? 'none' : 'fishBob 1.4s ease-in-out infinite',
              fontSize: cssRadiusPx * 1.1, lineHeight: 1,
            }}>{mole.emoji}</div>
          )
        })}

        {handDetected && (
          <div className="absolute pointer-events-none" style={{ left: `calc(${handNxDisplay * 100}% - 26px)`, top: `calc(${handNy * 100}% - 26px)`, width: 52, height: 52, borderRadius: '50%', background: 'rgba(70,224,255,0.2)', border: '3px solid #46e0ff', boxShadow: '0 0 18px rgba(70,224,255,0.6)' }} />
        )}

        {(isLoading || hasError) && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 text-white">
            {hasError ? (<><p className="text-4xl">⚠️</p><p className="text-xl font-semibold px-6 text-center">{cameraError?.message ?? landmarkerError}</p></>) : (<><p className="text-4xl animate-pulse">🎣</p><p className="text-xl">正在準備釣場…</p></>)}
          </div>
        )}
        {noHandWarn && gamePhase === 'playing' && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 text-white"><p className="text-5xl">👋</p><p className="text-2xl font-semibold">未偵測到手部</p><p className="text-lg opacity-80">請將手放到鏡頭前方</p></div>
        )}
        {gamePhase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white"><p className="text-2xl mb-4 opacity-80">準備好釣魚了嗎？</p><p className="text-9xl font-black text-cyan-300" style={{ textShadow: '0 0 40px rgba(70,224,255,0.7)' }}>{countdown > 0 ? countdown : '開始！'}</p><p className="text-lg mt-6 opacity-70">伸手向下把魚撈起來</p></div>
        )}
      </div>
      <style>{`@keyframes fishBob { 0%,100%{ transform: translateY(0) rotate(-4deg) } 50%{ transform: translateY(5px) rotate(4deg) } }`}</style>
    </div>
  )
}

function ConfigView({ onStart, onBack }: { onStart: (d: Difficulty) => void; onBack: () => void }) {
  const [selected, setSelected] = useState<Difficulty>('medium')
  const opts: { key: Difficulty; emoji: string; desc: string }[] = [
    { key: 'easy', emoji: '🟢', desc: '大魚・慢・靠近中間下方' },
    { key: 'medium', emoji: '🔵', desc: '中魚・中速・範圍較廣' },
    { key: 'hard', emoji: '🟣', desc: '小魚・快・全範圍下方' },
  ]
  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-10 gap-7 bg-gradient-to-b from-cyan-50 to-blue-100 game-menu-screen game-theme-aqua">
      <div className="text-center"><p className="text-5xl mb-3">🎣</p><h1 className="text-3xl font-extrabold text-blue-900">復能釣魚王</h1><p className="text-gray-600 mt-1.5">魚兒在下方出現，伸手向下／向前把牠撈起來</p></div>
      <div className="w-full max-w-xl bg-white rounded-2xl border border-blue-100 p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-500 mb-3">訓練目標</p>
        <div className="flex gap-3 flex-wrap">{['前伸搆取', '向下搆取', '肩屈曲', '肘伸直', '手眼協調'].map(t => <span key={t} className="text-xs font-semibold bg-blue-100 text-blue-800 px-3 py-1 rounded-full">{t}</span>)}</div>
      </div>
      <div className="w-full max-w-xl">
        <p className="text-sm font-semibold text-gray-600 mb-3">選擇難度</p>
        <div className="flex flex-col gap-3">{opts.map(({ key, emoji, desc }) => {
          const c = CFGS[key]; const active = selected === key
          return (
            <button key={key} onClick={() => setSelected(key)} className={`text-left p-4 rounded-xl border-2 transition-all ${active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
              <div className="flex items-center gap-2 mb-1"><span>{emoji}</span><span className="font-bold text-gray-900">{c.label} {c.sublabel}</span>{active && <span className="ml-auto text-xs font-bold text-blue-600">已選</span>}</div>
              <p className="text-sm text-gray-500">{desc}</p>
            </button>
          )
        })}</div>
      </div>
      <div className="w-full max-w-xl bg-cyan-50 rounded-xl p-4"><p className="text-sm text-cyan-800 leading-relaxed">💡 魚出現在畫面下半部，伸手向下讓偵測圈碰到魚即釣起。特別練習「向前/向下搆取」。</p></div>
      <div className="flex gap-3 w-full max-w-xl">
        <button onClick={onBack} className="flex-1 py-4 rounded-xl border-2 border-gray-300 text-gray-700 font-semibold text-lg">← 返回</button>
        <button onClick={() => onStart(selected)} className="flex-[2] py-4 rounded-xl bg-blue-600 text-white font-extrabold text-xl shadow-lg active:scale-[0.97]">開始釣魚 →</button>
      </div>
    </main>
  )
}

function ResultsView({ results, onReplay, onHome }: { results: GameResults; onReplay: () => void; onHome: () => void }) {
  const { hits, misses, hitRecords, difficulty } = results
  const cfg = CFGS[difficulty]
  const attempts = hits + misses
  const accuracy = attempts > 0 ? Math.round((hits / attempts) * 100) : 0
  const success = hitRecords.filter(r => r.success)
  const avgReaction = success.length > 0 ? Math.round(success.reduce((s, r) => s + r.reactionMs, 0) / success.length) : 0
  const rating = accuracy >= 85 ? { e: '🏆', t: '釣魚王！' } : accuracy >= 70 ? { e: '🌟', t: '非常好！' } : accuracy >= 50 ? { e: '👍', t: '做得好！' } : { e: '💪', t: '繼續加油！' }
  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-8 gap-5 bg-gradient-to-b from-cyan-50 to-blue-100 game-menu-screen game-theme-aqua">
      <div className="text-center"><p className="text-5xl mb-2">{rating.e}</p><h1 className="text-3xl font-extrabold text-gray-900">{rating.t}</h1><p className="text-gray-500 mt-1">復能釣魚王 · {cfg.label} {cfg.sublabel}</p></div>
      <div className="bg-blue-700 rounded-2xl px-16 py-4 text-center shadow-lg"><p className="text-sm text-blue-200">總分</p><p className="text-6xl font-black text-cyan-300 leading-none">{hits * 10}</p><p className="text-sm text-blue-200">分</p></div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
        {[{ label: '釣到', value: `${hits} 隻`, c: 'text-green-700', b: 'bg-green-50' }, { label: '成功率', value: `${accuracy}%`, c: 'text-blue-700', b: 'bg-blue-50' }, { label: '平均反應', value: avgReaction > 0 ? `${avgReaction} ms` : '—', c: 'text-orange-700', b: 'bg-orange-50' }, { label: '嘗試次數', value: `${attempts}`, c: 'text-purple-700', b: 'bg-purple-50' }].map(s => (
          <div key={s.label} className={`${s.b} rounded-xl p-4 text-center`}><p className="text-sm text-gray-500 mb-1">{s.label}</p><p className={`text-3xl font-black ${s.c}`}>{s.value}</p></div>
        ))}
      </div>
      <div className="flex gap-3 w-full max-w-xl mt-2">
        <button onClick={onHome} className="flex-1 py-4 rounded-xl border-2 border-gray-300 text-gray-700 font-semibold text-lg">🏠 首頁</button>
        <button onClick={onReplay} className="flex-[2] py-4 rounded-xl bg-blue-600 text-white font-extrabold text-xl shadow-lg active:scale-[0.97]">🔄 再釣一次</button>
      </div>
    </main>
  )
}

export default function FishingKingPage() {
  const router = useRouter()
  const [pagePhase, setPagePhase] = useState<PagePhase>('config')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [gameResults, setGameResults] = useState<GameResults | null>(null)
  const spokeResultRef = useRef(false)
  const { landmarker, isLoading, error: landmarkerError } = useHandLandmarker()

  const handleGameEnd = useCallback((results: GameResults) => {
    setGameResults(results); setPagePhase('results')
    if (!spokeResultRef.current) {
      spokeResultRef.current = true
      const attempts = results.hits + results.misses
      const accuracy = attempts > 0 ? (results.hits / attempts) * 100 : 0
      speak(accuracy >= 70 ? '太棒了，你做得很好！' : '繼續加油，下次會更好！')
    }
    const success = results.hitRecords.filter(r => r.success)
    const avg = success.length ? Math.round(success.reduce((s, r) => s + r.reactionMs, 0) / success.length) : null
    saveGameSession({
      game_type: 'fishing-king', difficulty: results.difficulty,
      score: results.hits * 10, hits: results.hits, misses: results.misses,
      avg_reaction_ms: avg, duration_secs: 60,
      ...computeZones(success.map(r => ({ nx: r.nx, ny: r.ny }))),
    })
  }, [])

  if (pagePhase === 'config') return <ConfigView onStart={d => { setDifficulty(d); setPagePhase('playing') }} onBack={() => router.push('/')} />
  if (pagePhase === 'playing') return <PlayingView cfg={CFGS[difficulty]} difficulty={difficulty} landmarker={landmarker} isLandmarkerLoading={isLoading} landmarkerError={landmarkerError} onGameEnd={handleGameEnd} />
  if (pagePhase === 'results' && gameResults) return <ResultsView results={gameResults} onReplay={() => { spokeResultRef.current = false; setGameResults(null); setPagePhase('playing') }} onHome={() => router.push('/')} />
  return null
}
