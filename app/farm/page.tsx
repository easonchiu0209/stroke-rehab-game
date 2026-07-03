'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { useCamera } from '@/hooks/useCamera'
import { useMoleDetector, type MoleTarget } from '@/hooks/useMoleDetector'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { SPECIES, plotEmoji, isRipe, type FarmState } from '@/lib/farm'
import { FarmHome } from '@/components/farm/FarmHome'
import { feedbackHit, speak } from '@/lib/feedback'
import { takeTrajectory, takePose } from '@/lib/saveSession'
import { usePoseMonitor } from '@/hooks/usePoseMonitor'
import CompensationHint from '@/components/game/CompensationHint'

// ── 照顧 session 設定（單一、長者友善：大目標、顯示久）─────────────────
const TEND = {
  hitRadiusPx: 64,
  displayMs:   3200,
  gameSecs:    60,
  spawnArea:   { xMin: 0.12, xMax: 0.88, yMin: 0.22, yMax: 0.74 },
}
const PEST_EMOJIS = ['🐛', '🐌', '🐦']

type Page = 'loading' | 'farm' | 'tending' | 'result'

interface TendResult {
  coinsEarned: number
  harvestCount: number
  levelUp: boolean
  platformPoints: number
  state: FarmState
}

// ── 照顧 session（AR）────────────────────────────────────────────────
type TargetMeta = { type: 'harvest' | 'pest'; plotIdx?: number; emoji: string; reward: number }
type FloatText  = { id: number; nx: number; ny: number; text: string; pest: boolean }

function TendingView({
  state, landmarker, isLandmarkerLoading, landmarkerError, onEnd,
}: {
  state: FarmState
  landmarker: HandLandmarker | null
  isLandmarkerLoading: boolean
  landmarkerError: string | null
  onEnd: (harvested: number[], pestsShooed: number) => void
}) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { isReady, error: cameraError, startCamera, stopCamera, isMirrored } = useCamera(videoRef)

  const [phase, setPhase]       = useState<'countdown' | 'playing' | 'ended'>('countdown')
  const [countdown, setCountdown] = useState(3)
  const [timeLeft, setTimeLeft]  = useState(TEND.gameSecs)
  const [coins, setCoins]        = useState(0)
  const [combo, setCombo]        = useState(0)
  const [moles, setMoles]        = useState<(MoleTarget & { expireAt: number; cssRadius: number })[]>([])
  const [hitIds, setHitIds]      = useState<Set<number>>(new Set())
  const [floats, setFloats]      = useState<FloatText[]>([])
  const [noHand, setNoHand]      = useState(false)

  const phaseRef    = useRef<'countdown' | 'playing' | 'ended'>('countdown')
  const molesRef    = useRef(moles)
  const metaRef     = useRef(new Map<number, TargetMeta>())
  const ripePoolRef = useRef<{ plotIdx: number; emoji: string; reward: number }[]>(
    state.plots.filter(isRipe).map(p => ({
      plotIdx: p.idx, emoji: plotEmoji(p), reward: p.species ? SPECIES[p.species].reward : 2,
    })),
  )
  const harvestedRef = useRef<Set<number>>(new Set())
  const pestsRef     = useRef(0)
  const coinsRef     = useRef(0)
  const comboRef     = useRef(0)
  const timersRef    = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const savedRef     = useRef(false)
  const noHandTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const floatId      = useRef(0)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { molesRef.current = moles }, [moles])
  useEffect(() => { startCamera('user'); return () => stopCamera() }, [startCamera, stopCamera])

  // 背景 Pose 監測：動作錄製 + 代償偵測（倒數階段收基準線）
  const { hint: poseHint } = usePoseMonitor({
    videoRef, isMirrored,
    active: phase === 'countdown' || phase === 'playing',
  })
  useEffect(() => { speak('開始照顧農場，加油！') }, [])

  const isActive = phase === 'playing' && isReady && landmarker !== null && !isLandmarkerLoading && !landmarkerError

  const spawnRef = useRef<() => void>(() => {})

  const pushFloat = useCallback((nx: number, ny: number, text: string, pest: boolean) => {
    const id = ++floatId.current
    setFloats(prev => [...prev, { id, nx, ny, text, pest }])
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 950)
  }, [])

  const handleHit = useCallback((id: number, _reactionMs: number) => {
    if (phaseRef.current !== 'playing') return
    const meta = metaRef.current.get(id)
    const t = timersRef.current.get(id)
    if (t) { clearTimeout(t); timersRef.current.delete(id) }
    const m = molesRef.current.find(x => x.id === id)
    const nx = m?.nx ?? 0.5, ny = m?.ny ?? 0.5

    if (meta?.type === 'harvest' || meta?.type === 'pest') feedbackHit()

    if (meta?.type === 'harvest' && meta.plotIdx != null) {
      harvestedRef.current.add(meta.plotIdx)
      ripePoolRef.current = ripePoolRef.current.filter(r => r.plotIdx !== meta.plotIdx)
      coinsRef.current += meta.reward
      comboRef.current += 1
      setCombo(comboRef.current)
      pushFloat(nx, ny, `＋${meta.reward} 🪙`, false)
    } else if (meta?.type === 'pest') {
      pestsRef.current += 1
      coinsRef.current += 1
      pushFloat(nx, ny, `趕走！＋1`, true)
    }
    setCoins(coinsRef.current)
    setHitIds(prev => new Set(prev).add(id))

    setTimeout(() => {
      setMoles(prev => prev.filter(x => x.id !== id))
      setHitIds(prev => { const s = new Set(prev); s.delete(id); return s })
      metaRef.current.delete(id)
      setTimeout(() => spawnRef.current(), 260)
    }, 240)
  }, [pushFloat])

  const { handDetected, handNxDisplay, handNy, setMoles: syncDetector } = useMoleDetector({
    landmarker, videoRef, canvasRef, isActive,
    hitRadiusPx: TEND.hitRadiusPx + 20, isMirrored, onHit: handleHit,
  })
  useEffect(() => { syncDetector(moles) }, [moles, syncDetector])

  const spawn = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    const { xMin, xMax, yMin, yMax } = TEND.spawnArea
    const nx = xMin + Math.random() * (xMax - xMin)
    const ny = yMin + Math.random() * (yMax - yMin)
    const id = performance.now() + Math.random() * 100000
    const now = performance.now()
    const cssR = TEND.hitRadiusPx * 1.1

    const pool = ripePoolRef.current
    let meta: TargetMeta
    if (pool.length > 0 && Math.random() < 0.78) {
      const pick = pool[Math.floor(Math.random() * pool.length)]
      meta = { type: 'harvest', plotIdx: pick.plotIdx, emoji: pick.emoji, reward: pick.reward }
    } else {
      meta = { type: 'pest', emoji: PEST_EMOJIS[Math.floor(Math.random() * PEST_EMOJIS.length)], reward: 1 }
    }
    metaRef.current.set(id, meta)
    setMoles(prev => [...prev, { id, nx, ny, spawnTime: now, expireAt: now + TEND.displayMs, cssRadius: cssR }])

    const timer = setTimeout(() => {
      timersRef.current.delete(id)
      if (phaseRef.current !== 'playing') return
      // 沒收到 → 連續中斷
      if (metaRef.current.get(id)?.type === 'harvest') { comboRef.current = 0; setCombo(0) }
      setMoles(prev => prev.filter(x => x.id !== id))
      metaRef.current.delete(id)
      setTimeout(() => spawnRef.current(), 320)
    }, TEND.displayMs)
    timersRef.current.set(id, timer)
  }, [])
  useEffect(() => { spawnRef.current = spawn }, [spawn])

  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) { setPhase('playing'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown])

  useEffect(() => {
    if (phase !== 'playing') return
    if (timeLeft <= 0) { setPhase('ended'); return }
    const t = setTimeout(() => setTimeLeft(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, timeLeft])

  useEffect(() => { if (phase === 'playing') spawnRef.current() }, [phase])

  useEffect(() => {
    if (phase !== 'ended' || savedRef.current) return
    savedRef.current = true
    timersRef.current.forEach(t => clearTimeout(t))
    timersRef.current.clear()
    onEnd(Array.from(harvestedRef.current), pestsRef.current)
  }, [phase, onEnd])

  useEffect(() => {
    if (phase !== 'playing') return
    if (!handDetected) noHandTimer.current = setTimeout(() => setNoHand(true), 3000)
    else { if (noHandTimer.current) clearTimeout(noHandTimer.current); setNoHand(false) }
    return () => { if (noHandTimer.current) clearTimeout(noHandTimer.current) }
  }, [phase, handDetected])

  const hasError = !!(cameraError || landmarkerError)
  const isLoading = !isReady || isLandmarkerLoading
  const cssR = TEND.hitRadiusPx * 1.1
  const ripeLeft = ripePoolRef.current.length

  return (
    <div className="flex flex-col w-full h-screen overflow-hidden select-none" style={{ background: '#1b3a1f' }}>
      {/* ── 木牌風 HUD ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0 z-20"
        style={{ background: 'linear-gradient(#8d5a2b,#6b3f1d)', boxShadow: '0 4px 10px rgba(0,0,0,0.4)' }}>
        <div className="flex items-center gap-1.5 bg-amber-100/90 rounded-full px-3 py-1 shadow">
          <span className="text-2xl" style={{ animation: 'coinSpin 2.2s linear infinite' }}>🪙</span>
          <span className="text-2xl font-black text-amber-800 tabular-nums">{coins}</span>
        </div>
        <div className="text-center">
          {phase === 'countdown' && <p className="text-4xl font-black text-amber-50">{countdown > 0 ? countdown : '開始！'}</p>}
          {phase === 'playing' && (
            <div className={`px-4 py-0.5 rounded-full font-black tabular-nums ${timeLeft <= 10 ? 'bg-red-500 text-white animate-pulse' : 'bg-amber-100/90 text-amber-900'}`}>
              <span className="text-3xl">{timeLeft}</span><span className="text-sm">s</span>
            </div>
          )}
          {phase === 'ended' && <p className="text-xl font-bold text-amber-50">採收完成！</p>}
        </div>
        <div className="flex items-center gap-1.5 bg-amber-100/90 rounded-full px-3 py-1 shadow">
          <span className="text-2xl">🧺</span>
          <span className="text-xl font-black text-green-700 tabular-nums">{ripeLeft}</span>
        </div>
      </div>

      {/* ── AR 場景 ──────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" style={{ transform: isMirrored ? 'scaleX(-1)' : undefined }} />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ transform: isMirrored ? 'scaleX(-1)' : undefined }} />

        {/* 代償提醒（聳肩/前傾/側彎） */}
        <CompensationHint hint={poseHint} />

        {/* 農場場景疊層 */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          {/* 天空 */}
          <div className="absolute inset-x-0 top-0 h-1/3" style={{ background: 'linear-gradient(to bottom, rgba(135,206,250,0.55), rgba(135,206,250,0))' }} />
          <div className="absolute text-5xl" style={{ top: 8, right: 14, filter: 'drop-shadow(0 0 12px rgba(255,221,87,0.8))' }}>☀️</div>
          <div className="absolute text-4xl opacity-80" style={{ top: 26, left: '8%', animation: 'cloud 26s linear infinite' }}>☁️</div>
          <div className="absolute text-3xl opacity-70" style={{ top: 60, left: '40%', animation: 'cloud 34s linear infinite' }}>☁️</div>
          {/* 地面草皮 + 柵欄 */}
          <div className="absolute inset-x-0 bottom-0 h-[14%]" style={{ background: 'linear-gradient(to top, rgba(76,139,53,0.85), rgba(76,139,53,0))' }} />
          <div className="absolute inset-x-0 bottom-[11%] h-6 opacity-80 text-xl tracking-[0.4em] whitespace-nowrap overflow-hidden text-center" style={{ color: '#c8a26b' }}>
            ┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃
          </div>
          {/* 暈影 */}
          <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 120px 40px rgba(0,0,0,0.45)' }} />
        </div>

        {/* 目標 */}
        {moles.map(mole => {
          const meta = metaRef.current.get(mole.id)
          const isHit = hitIds.has(mole.id)
          const isPest = meta?.type === 'pest'
          return (
            <div key={mole.id} className="absolute pointer-events-none"
              style={{
                left: `calc(${mole.nx * 100}% - ${cssR}px)`, top: `calc(${mole.ny * 100}% - ${cssR}px)`,
                width: cssR * 2, height: cssR * 2,
                transform: isHit ? 'scale(1.55)' : 'scale(1)',
                opacity: isHit ? 0 : 1,
                transition: isHit ? 'transform 0.24s ease-out, opacity 0.24s' : 'none',
              }}>
              {/* 光暈 */}
              <div className="absolute inset-0 rounded-full" style={{
                background: isPest
                  ? 'radial-gradient(circle, rgba(244,67,54,0.45), transparent 70%)'
                  : 'radial-gradient(circle, rgba(255,221,87,0.65), transparent 68%)',
                animation: isHit ? 'none' : 'glowPulse 1.4s ease-in-out infinite',
              }} />
              {/* 土堆 / 草叢（採收目標才有）*/}
              {!isPest && (
                <div className="absolute left-1/2 -translate-x-1/2" style={{
                  bottom: -2, width: cssR * 1.7, height: cssR * 0.55, borderRadius: '50%',
                  background: 'radial-gradient(circle at 50% 30%, #a9742f, #6b3f1d)', boxShadow: '0 3px 6px rgba(0,0,0,0.4)',
                }} />
              )}
              {/* 主體 emoji */}
              <div className="absolute inset-0 flex items-center justify-center"
                style={{
                  fontSize: cssR * 1.45, lineHeight: 1,
                  filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.5))',
                  animation: isHit ? 'none' : isPest ? 'jitter 0.4s ease-in-out infinite' : 'bob 1.6s ease-in-out infinite, popIn 0.36s ease-out',
                }}>
                {meta?.emoji ?? '🥕'}
              </div>
              {/* 成熟閃爍 */}
              {!isPest && !isHit && (
                <div className="absolute text-xl" style={{ top: 2, right: 6, animation: 'tw 1.3s ease-in-out infinite' }}>✨</div>
              )}
            </div>
          )
        })}

        {/* 浮動文字 */}
        {floats.map(f => (
          <div key={f.id} className="absolute pointer-events-none font-black"
            style={{
              left: `${f.nx * 100}%`, top: `${f.ny * 100}%`,
              fontSize: 26, color: f.pest ? '#ff8a65' : '#ffe14d',
              textShadow: '0 2px 4px rgba(0,0,0,0.7)', animation: 'floatUp 0.95s ease-out forwards',
            }}>
            {f.text}
          </div>
        ))}

        {/* combo */}
        {combo >= 3 && phase === 'playing' && (
          <div className="absolute left-1/2 -translate-x-1/2 top-3 px-4 py-1 rounded-full font-black text-white"
            style={{ background: 'linear-gradient(90deg,#ff9800,#f44336)', boxShadow: '0 4px 12px rgba(244,67,54,0.5)', animation: 'pop 0.3s ease-out' }}>
            🔥 連續採收 ×{combo}
          </div>
        )}

        {/* 手部游標 */}
        {handDetected && (
          <div className="absolute pointer-events-none" style={{ left: `calc(${handNxDisplay * 100}% - 34px)`, top: `calc(${handNy * 100}% - 34px)`, width: 68, height: 68 }}>
            <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,235,130,0.35), transparent 65%)' }} />
            <div className="absolute inset-2 rounded-full" style={{ border: '3px solid rgba(255,235,59,0.95)', boxShadow: '0 0 16px rgba(255,214,0,0.7), inset 0 0 10px rgba(255,214,0,0.4)' }} />
            <div className="absolute left-1/2 top-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-200" />
          </div>
        )}

        {/* loading / error */}
        {(isLoading || hasError) && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 text-white">
            {hasError ? (<><p className="text-4xl">⚠️</p><p className="text-xl font-semibold px-6 text-center">{cameraError?.message ?? landmarkerError}</p></>)
              : (<><p className="text-4xl animate-pulse">🌱</p><p className="text-xl">正在準備農場…</p></>)}
          </div>
        )}

        {noHand && phase === 'playing' && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 text-white">
            <p className="text-5xl">👋</p><p className="text-2xl font-semibold">看不到你的手</p><p className="text-lg opacity-80">請把手伸到鏡頭前</p>
          </div>
        )}

        {phase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/30">
            <p className="text-2xl mb-3 opacity-90">準備好照顧農場了嗎？</p>
            <p className="text-8xl font-black text-amber-300" style={{ textShadow: '0 0 40px rgba(255,214,0,0.7)' }}>{countdown > 0 ? countdown : '開始！'}</p>
            <p className="text-lg mt-5 opacity-80">伸手採收成熟作物 🥕，趕走害蟲 🐛</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes bob { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-7px) } }
        @keyframes jitter { 0%,100%{ transform: translateX(-3px) rotate(-6deg) } 50%{ transform: translateX(3px) rotate(6deg) } }
        @keyframes popIn { 0%{ transform: scale(0.2) } 70%{ transform: scale(1.15) } 100%{ transform: scale(1) } }
        @keyframes glowPulse { 0%,100%{ opacity: 0.55; transform: scale(0.95) } 50%{ opacity: 0.95; transform: scale(1.12) } }
        @keyframes tw { 0%,100%{ opacity: 0.3; transform: scale(0.8) } 50%{ opacity: 1; transform: scale(1.2) } }
        @keyframes floatUp { 0%{ transform: translate(-50%,-50%) scale(0.8); opacity: 0 } 20%{ opacity: 1; transform: translate(-50%,-90%) scale(1.1) } 100%{ transform: translate(-50%,-200%) scale(1); opacity: 0 } }
        @keyframes cloud { 0%{ transform: translateX(-10vw) } 100%{ transform: translateX(110vw) } }
        @keyframes coinSpin { 0%{ transform: rotateY(0) } 100%{ transform: rotateY(360deg) } }
        @keyframes pop { 0%{ transform: translateX(-50%) scale(0.6) } 100%{ transform: translateX(-50%) scale(1) } }
      `}</style>
    </div>
  )
}

// ── 結算 ──────────────────────────────────────────────────────────────
function ResultView({ result, onBackToFarm, onHome }: {
  result: TendResult; onBackToFarm: () => void; onHome: () => void
}) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-200 via-lime-100 to-amber-100 flex flex-col items-center justify-center px-5 gap-6">
      <div className="text-center">
        <p className="text-6xl mb-2">🧺</p>
        <h1 className="text-3xl font-extrabold text-green-900">採收完成！</h1>
        {result.levelUp && <p className="text-amber-600 font-bold mt-2 text-lg">🎉 農場升級到 Lv.{result.state.level}！</p>}
      </div>
      <div className="rounded-3xl px-12 py-5 text-center shadow-xl" style={{ background: 'linear-gradient(#8d5a2b,#6b3f1d)' }}>
        <p className="text-amber-200 text-base">這次賺到</p>
        <p className="text-6xl font-black text-yellow-300 leading-none mt-1">🪙 {result.coinsEarned}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
          <p className="text-sm text-gray-500">採收</p>
          <p className="text-3xl font-black text-green-700">{result.harvestCount} 個</p>
        </div>
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
          <p className="text-sm text-gray-500">平台積分</p>
          <p className="text-3xl font-black text-purple-600">+{result.platformPoints}</p>
        </div>
      </div>
      <div className="flex gap-3 w-full max-w-sm">
        <button onClick={onHome} className="flex-1 py-3.5 rounded-2xl border-2 border-gray-300 text-gray-700 font-semibold">🏠 首頁</button>
        <button onClick={onBackToFarm} className="flex-[2] py-3.5 rounded-2xl text-white font-extrabold text-lg shadow-lg" style={{ background: 'linear-gradient(90deg,#43a047,#2e7d32)' }}>🌻 回農場</button>
      </div>
    </main>
  )
}

// ── Page root ─────────────────────────────────────────────────────────
export default function FarmPage() {
  const router = useRouter()
  const { status } = useSession()
  const [page, setPage] = useState<Page>('loading')
  const [state, setState] = useState<FarmState | null>(null)
  const [result, setResult] = useState<TendResult | null>(null)

  const { landmarker, isLoading, error: landmarkerError } = useHandLandmarker()

  const loadState = useCallback(async () => {
    const r = await fetch('/api/farm')
    if (r.status === 401) { signIn('line'); return }
    const s = await r.json()
    setState(s)
    setPage('farm')
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') { signIn('line'); return }
    if (status === 'authenticated') loadState()
  }, [status, loadState])

  const handleEnd = useCallback(async (harvested: number[], pestsShooed: number) => {
    // 附上手部軌跡 + pose 動作/代償資料（共享暫存，與 saveGameSession 同機制）
    const trajectory = takeTrajectory()
    const pose = takePose()
    const r = await fetch('/api/farm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        harvested, pestsShooed, duration_secs: TEND.gameSecs,
        trajectory: trajectory.length ? trajectory : undefined,
        pose_frames: pose?.frames.length ? pose.frames : undefined,
        pose_landmark_ids: pose?.landmarkIds,
        pose_fps: pose?.fps,
        compensations: pose?.events.length ? pose.events : undefined,
      }),
    })
    const res: TendResult = await r.json()
    setResult(res)
    setState(res.state)
    setPage('result')
  }, [])

  if (status === 'loading' || page === 'loading' || !state) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-xl animate-pulse">載入農場中…</div>
  }

  if (page === 'tending') {
    return <TendingView state={state} landmarker={landmarker} isLandmarkerLoading={isLoading} landmarkerError={landmarkerError} onEnd={handleEnd} />
  }

  if (page === 'result' && result) {
    return <ResultView result={result} onBackToFarm={() => setPage('farm')} onHome={() => router.push('/')} />
  }

  return <FarmHome state={state} onTend={() => setPage('tending')} onChanged={setState} />
}
