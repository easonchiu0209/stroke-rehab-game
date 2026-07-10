'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { useCamera } from '@/hooks/useCamera'
import { useMoleDetector, type MoleTarget } from '@/hooks/useMoleDetector'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import {
  FISHES, ALL_FISH, expandCost, rollFish, MAX_STAGE,
  type Fish, type AquariumState,
} from '@/lib/aquarium'
import { feedbackHit, speak } from '@/lib/feedback'
import { useHubTheme } from '@/hooks/useHubTheme'

type Page = 'loading' | 'tank' | 'fishing' | 'result'
interface FishResult { caughtCount: number; added: number; overflow: number; pearlsEarned: number; levelUp: boolean; state: AquariumState }

const TEND = { hitRadiusPx: 62, displayMs: 3000, gameSecs: 50, spawnArea: { xMin: 0.12, xMax: 0.88, yMin: 0.42, yMax: 0.9 } }
interface FishMole extends MoleTarget { expireAt: number; cssRadius: number; species: Fish; emoji: string }

// ── 釣魚 AR ────────────────────────────────────────────────────
function FishingView({ unlocked, landmarker, isLoading, lmError, onEnd }: {
  unlocked: Fish[]; landmarker: HandLandmarker | null; isLoading: boolean; lmError: string | null
  onEnd: (caught: Fish[]) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { isReady, error: camError, startCamera, stopCamera, isMirrored } = useCamera(videoRef)

  const [phase, setPhase] = useState<'countdown' | 'playing' | 'ended'>('countdown')
  const [countdown, setCountdown] = useState(3)
  const [timeLeft, setTimeLeft] = useState(TEND.gameSecs)
  const [caught, setCaught] = useState(0)
  const [moles, setMoles] = useState<FishMole[]>([])
  const [hitIds, setHitIds] = useState<Set<number>>(new Set())
  const [noHand, setNoHand] = useState(false)

  const phaseRef = useRef<'countdown' | 'playing' | 'ended'>('countdown')
  const caughtRef = useRef<Fish[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const savedRef = useRef(false)
  const noHandT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spawnRef = useRef<() => void>(() => {})

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { startCamera('user'); return () => stopCamera() }, [startCamera, stopCamera])
  useEffect(() => { speak('開始釣魚，加油！') }, [])

  const active = phase === 'playing' && isReady && !!landmarker && !isLoading && !lmError

  const handleHit = useCallback((id: number) => {
    if (phaseRef.current !== 'playing') return
    const t = timers.current.get(id); if (t) { clearTimeout(t); timers.current.delete(id) }
    setMoles(prev => {
      const m = prev.find(x => x.id === id)
      if (m) { caughtRef.current.push(m.species); setCaught(caughtRef.current.length); feedbackHit() }
      return prev
    })
    setHitIds(prev => new Set(prev).add(id))
    setTimeout(() => {
      setMoles(prev => prev.filter(m => m.id !== id))
      setHitIds(prev => { const s = new Set(prev); s.delete(id); return s })
      setTimeout(() => spawnRef.current(), 280)
    }, 260)
  }, [])

  const { handDetected, handNxDisplay, handNy, setMoles: sync } = useMoleDetector({
    landmarker, videoRef, canvasRef, isActive: active, hitRadiusPx: TEND.hitRadiusPx + 20, isMirrored, onHit: handleHit,
  })
  useEffect(() => { sync(moles) }, [moles, sync])

  const spawn = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    const { xMin, xMax, yMin, yMax } = TEND.spawnArea
    const nx = xMin + Math.random() * (xMax - xMin)
    const ny = yMin + Math.random() * (yMax - yMin)
    const id = performance.now() + Math.random() * 1e5
    const now = performance.now()
    const sp = rollFish(unlocked)
    const mole: FishMole = { id, nx, ny, spawnTime: now, expireAt: now + TEND.displayMs, cssRadius: TEND.hitRadiusPx * 1.1, species: sp, emoji: FISHES[sp].emoji }
    setMoles(prev => [...prev, mole])
    const timer = setTimeout(() => {
      timers.current.delete(id)
      if (phaseRef.current !== 'playing') return
      setMoles(prev => prev.filter(m => m.id !== id))
      setTimeout(() => spawnRef.current(), 380)
    }, TEND.displayMs)
    timers.current.set(id, timer)
  }, [unlocked])
  useEffect(() => { spawnRef.current = spawn }, [spawn])

  useEffect(() => { if (phase !== 'countdown') return; if (countdown <= 0) { setPhase('playing'); return } const t = setTimeout(() => setCountdown(c => c - 1), 1000); return () => clearTimeout(t) }, [phase, countdown])
  useEffect(() => { if (phase !== 'playing') return; if (timeLeft <= 0) { setPhase('ended'); return } const t = setTimeout(() => setTimeLeft(n => n - 1), 1000); return () => clearTimeout(t) }, [phase, timeLeft])
  useEffect(() => { if (phase === 'playing') spawnRef.current() }, [phase])
  useEffect(() => {
    if (phase !== 'ended' || savedRef.current) return
    savedRef.current = true
    timers.current.forEach(t => clearTimeout(t)); timers.current.clear()
    onEnd(caughtRef.current)
  }, [phase, onEnd])
  useEffect(() => {
    if (phase !== 'playing') return
    if (!handDetected) noHandT.current = setTimeout(() => setNoHand(true), 3000)
    else { if (noHandT.current) clearTimeout(noHandT.current); setNoHand(false) }
    return () => { if (noHandT.current) clearTimeout(noHandT.current) }
  }, [phase, handDetected])

  const cssR = TEND.hitRadiusPx * 1.1
  const hasErr = !!(camError || lmError)
  const loading = !isReady || isLoading

  return (
    <div className="flex flex-col w-full h-screen overflow-hidden select-none" style={{ background: '#06243f' }}>
      <div className="flex items-center justify-between px-5 py-2.5 bg-black/50 text-white shrink-0">
        <div><p className="text-xs opacity-60">釣到</p><p className="text-4xl font-black text-cyan-300 leading-none">🐟{caught}</p></div>
        <div className="text-center">
          {phase === 'countdown' && <p className="text-6xl font-black">{countdown > 0 ? countdown : '開始！'}</p>}
          {phase === 'playing' && (<><p className="text-xs opacity-60">剩餘時間</p><p className={`text-5xl font-black leading-none ${timeLeft <= 10 ? 'text-red-400' : ''}`}>{timeLeft}</p></>)}
          {phase === 'ended' && <p className="text-2xl font-bold text-cyan-300">收竿！</p>}
        </div>
        <div className="w-12" />
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(#1b4e7a, #06243f 75%)' }} />
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-0" style={{ transform: isMirrored ? 'scaleX(-1)' : undefined }} />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ transform: isMirrored ? 'scaleX(-1)' : undefined }} />
        {moles.map(m => {
          const isHit = hitIds.has(m.id)
          return (
            <div key={m.id} className="absolute pointer-events-none flex items-center justify-center" style={{
              left: `calc(${m.nx * 100}% - ${cssR}px)`, top: `calc(${m.ny * 100}% - ${cssR}px)`, width: cssR * 2, height: cssR * 2, borderRadius: '50%',
              background: isHit ? 'radial-gradient(circle,#FFD600,#FF6F00)' : 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.9), rgba(120,200,255,0.6) 45%, rgba(30,130,200,0.5) 100%)',
              border: '4px solid rgba(255,255,255,0.85)', boxShadow: isHit ? '0 0 50px rgba(255,214,0,1)' : '0 4px 18px rgba(0,0,0,0.4)',
              transform: isHit ? 'scale(1.5)' : 'scale(1)', opacity: isHit ? 0 : 1, transition: isHit ? 'transform 0.25s,opacity 0.25s' : 'none',
              animation: isHit ? 'none' : 'fishBob 1.4s ease-in-out infinite', fontSize: cssR * 1.1, lineHeight: 1,
            }}>{m.emoji}</div>
          )
        })}
        {handDetected && <div className="absolute pointer-events-none" style={{ left: `calc(${handNxDisplay * 100}% - 26px)`, top: `calc(${handNy * 100}% - 26px)`, width: 52, height: 52, borderRadius: '50%', background: 'rgba(70,224,255,0.2)', border: '3px solid #46e0ff', boxShadow: '0 0 18px rgba(70,224,255,0.6)' }} />}
        {(loading || hasErr) && <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 text-white">{hasErr ? <><p className="text-4xl">⚠️</p><p className="text-lg px-6 text-center">{camError?.message ?? lmError}</p></> : <><p className="text-4xl animate-pulse">🎣</p><p className="text-xl">準備釣場中…</p></>}</div>}
        {noHand && phase === 'playing' && <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 text-white"><p className="text-5xl">👋</p><p className="text-2xl font-semibold">未偵測到手部</p></div>}
        {phase === 'countdown' && <div className="absolute inset-0 flex flex-col items-center justify-center text-white"><p className="text-2xl mb-4 opacity-80">準備好釣魚了嗎？</p><p className="text-9xl font-black text-cyan-300">{countdown > 0 ? countdown : '開始！'}</p><p className="text-lg mt-6 opacity-70">伸手向下把魚撈起來</p></div>}
      </div>
      <style>{`@keyframes fishBob{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(5px) rotate(4deg)}}`}</style>
    </div>
  )
}

// ── 魚缸主頁 ────────────────────────────────────────────────────
function TankHome({ state, onFish, onChanged }: { state: AquariumState; onFish: () => void; onChanged: (s: AquariumState) => void }) {
  const router = useRouter()
  const [shop, setShop] = useState(false)
  const [busy, setBusy] = useState(false)
  const { background, themeEmoji, canSwitch, cycle } = useHubTheme('aquarium')

  async function doShop(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true)
    const r = await fetch('/api/aquarium/shop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) })
    setBusy(false)
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error ?? '操作失敗'); return }
    onChanged(await fetch('/api/aquarium').then(x => x.json()))
  }

  const scaleFor = (st: number) => st >= 2 ? 1.2 : st === 1 ? 0.95 : 0.72

  return (
    <main className="min-h-screen flex flex-col items-center px-3 py-4 gap-4" style={{ background }}>
      <div className="w-full max-w-lg flex items-center justify-between">
        <button onClick={() => router.push('/')} className="text-blue-900/80 font-bold bg-white/70 rounded-full px-3 py-1 shadow-sm">← 首頁</button>
        <div className="flex items-center gap-2">
          {canSwitch && (
            <button onClick={cycle} title="切換佈景主題"
              className="bg-white rounded-full px-3 py-1 shadow font-bold active:scale-95">🎨 {themeEmoji}</button>
          )}
          <span className="bg-white rounded-full px-3 py-1 shadow font-bold text-sky-600">🫧 {state.pearls}</span>
          <span className="bg-white rounded-full px-3 py-1 shadow font-bold text-blue-700">Lv.{state.level}</span>
        </div>
      </div>
      <h1 className="text-2xl font-extrabold text-blue-900 drop-shadow-sm">🐠 復能水族箱</h1>

      {/* 魚缸 */}
      <div className="relative w-full max-w-lg rounded-[26px] overflow-hidden shadow-xl" style={{ border: '6px solid #5a93c4', height: 340, background: 'linear-gradient(#2a7ab5, #0b3a5e)' }}>
        {/* 光線 */}
        <div className="absolute inset-x-0 top-0 h-16 pointer-events-none" style={{ background: 'linear-gradient(rgba(255,255,255,0.3),transparent)' }} />
        {/* 底砂與水草 */}
        <div className="absolute inset-x-0 bottom-0 h-10" style={{ background: 'linear-gradient(to top,#c9a86a,transparent)' }} />
        <div className="absolute bottom-1 left-4 text-3xl">🌿</div><div className="absolute bottom-1 left-14 text-2xl">🪸</div>
        <div className="absolute bottom-1 right-6 text-3xl">🌿</div><div className="absolute bottom-2 right-20 text-xl">🐚</div>
        {/* 魚群 */}
        {state.fish.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-white/80 text-lg">魚缸是空的，去釣魚吧！</div>}
        {state.fish.map((f, i) => {
          const top = 12 + (i * 29) % 70
          const dur = 7 + (i % 5) * 2
          const rev = i % 2 === 0
          return (
            <div key={f.id} className="absolute" style={{
              top: `${top}%`, left: 0, fontSize: `${2.2 * scaleFor(f.stage)}rem`, lineHeight: 1,
              animation: `${rev ? 'swimR' : 'swimL'} ${dur}s linear infinite`, animationDelay: `${(i * 1.3) % 6}s`,
              filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))',
            }}>
              <span style={{ display: 'inline-block', transform: rev ? 'scaleX(-1)' : undefined }}>{FISHES[f.species].emoji}</span>
            </div>
          )
        })}
        <span className="absolute top-2 right-3 text-xs font-bold text-white/90 bg-black/30 rounded-full px-2 py-0.5">{state.fish.length}/{state.capacity}</span>
      </div>

      {/* 圖鑑 */}
      <div className="w-full max-w-lg bg-white/80 rounded-2xl p-3">
        <p className="text-sm font-bold text-blue-900 mb-2">📖 魚類圖鑑 {state.discovered.length}/{ALL_FISH.length}</p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_FISH.map(f => {
            const got = state.discovered.includes(f.id)
            return <span key={f.id} className="text-2xl" title={got ? f.name : '???'} style={{ filter: got ? undefined : 'grayscale(1) opacity(0.35)' }}>{f.emoji}</span>
          })}
        </div>
      </div>

      <div className="w-full max-w-lg flex flex-col gap-3">
        <button onClick={onFish} className="w-full py-4 rounded-2xl text-white font-extrabold text-xl shadow-lg active:scale-[0.97]" style={{ background: 'linear-gradient(90deg,#0288d1,#01579b)' }}>🎣 去釣魚</button>
        <button onClick={() => setShop(true)} className="w-full py-3 rounded-2xl bg-white border-2 border-sky-200 text-sky-700 font-bold active:scale-95">🛒 商店（解鎖魚種 / 擴缸）</button>
      </div>

      {shop && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-20 p-4" onClick={() => setShop(false)}>
          <div className="bg-white rounded-3xl p-5 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><p className="text-xl font-bold text-gray-800">🛒 水族商店</p><span className="font-bold text-sky-600">🫧 {state.pearls}</span></div>
            <p className="text-sm font-semibold text-gray-500 mb-2">擴大魚缸</p>
            <button disabled={busy} onClick={() => doShop('expand')} className="w-full mb-4 p-3 rounded-2xl border-2 border-sky-200 flex items-center justify-between active:scale-[0.98]">
              <span className="font-semibold text-gray-700">➕ 容量 +4（目前 {state.capacity}）</span><span className="font-bold text-sky-600">🫧 {expandCost(state.capacity)}</span>
            </button>
            <p className="text-sm font-semibold text-gray-500 mb-2">解鎖魚種（解鎖後釣得到）</p>
            <div className="flex flex-col gap-2">
              {ALL_FISH.filter(f => !state.unlocked.includes(f.id)).map(f => (
                <button key={f.id} disabled={busy || state.pearls < f.unlockCost} onClick={() => doShop('unlock', { species: f.id })} className="p-3 rounded-2xl border-2 border-gray-200 flex items-center justify-between active:scale-[0.98] disabled:opacity-40">
                  <span className="flex items-center gap-2"><span className="text-2xl">{f.emoji}</span><span className="font-semibold text-gray-700">{f.name}</span><span className="text-xs text-gray-400">{f.rarity === 'epic' ? '稀世' : f.rarity === 'rare' ? '稀有' : '普通'}・產 🫧{f.pearl}</span></span>
                  <span className="font-bold text-sky-600">🫧 {f.unlockCost}</span>
                </button>
              ))}
              {ALL_FISH.filter(f => !state.unlocked.includes(f.id)).length === 0 && <p className="text-center text-gray-400 py-3">全部解鎖完成 🎉</p>}
            </div>
            <button onClick={() => setShop(false)} className="w-full mt-4 py-2.5 rounded-2xl bg-gray-100 text-gray-600 font-semibold">關閉</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes swimL { 0%{ transform: translateX(-12vw) } 100%{ transform: translateX(108vw) } }
        @keyframes swimR { 0%{ transform: translateX(108vw) } 100%{ transform: translateX(-12vw) } }
      `}</style>
    </main>
  )
}

function ResultView({ r, onBack, onHome }: { r: FishResult; onBack: () => void; onHome: () => void }) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-200 to-blue-300 flex flex-col items-center justify-center px-5 gap-6">
      <div className="text-center"><p className="text-6xl mb-2">🎣</p><h1 className="text-3xl font-extrabold text-blue-900">收竿！</h1>{r.levelUp && <p className="text-amber-600 font-bold mt-2 text-lg">🎉 水族箱升級到 Lv.{r.state.level}！</p>}</div>
      <div className="rounded-3xl px-12 py-5 text-center shadow-xl" style={{ background: 'linear-gradient(#0288d1,#01579b)' }}>
        <p className="text-sky-100 text-base">這次釣到</p><p className="text-6xl font-black text-cyan-200 leading-none mt-1">🐟 {r.caughtCount}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm"><p className="text-sm text-gray-500">進魚缸</p><p className="text-3xl font-black text-blue-700">{r.added} 隻</p></div>
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm"><p className="text-sm text-gray-500">珍珠收成</p><p className="text-3xl font-black text-sky-600">🫧 {r.pearlsEarned}</p></div>
      </div>
      {r.overflow > 0 && <p className="text-sm text-blue-800/80">魚缸滿了，{r.overflow} 隻放生換了珍珠 🫧 — 去商店擴缸吧！</p>}
      <div className="flex gap-3 w-full max-w-sm">
        <button onClick={onHome} className="flex-1 py-3.5 rounded-2xl border-2 border-white text-white font-semibold bg-white/20">🏠 首頁</button>
        <button onClick={onBack} className="flex-[2] py-3.5 rounded-2xl text-white font-extrabold text-lg shadow-lg" style={{ background: 'linear-gradient(90deg,#0288d1,#01579b)' }}>🐠 回魚缸</button>
      </div>
    </main>
  )
}

export default function AquariumPage() {
  const router = useRouter()
  const { status } = useSession()
  const [page, setPage] = useState<Page>('loading')
  const [state, setState] = useState<AquariumState | null>(null)
  const [result, setResult] = useState<FishResult | null>(null)
  const { landmarker, isLoading, error: lmError } = useHandLandmarker()

  const loadState = useCallback(async () => {
    const r = await fetch('/api/aquarium')
    if (r.status === 401) { signIn('line'); return }
    setState(await r.json()); setPage('tank')
  }, [])
  useEffect(() => { if (status === 'unauthenticated') signIn('line'); else if (status === 'authenticated') loadState() }, [status, loadState])

  const handleEnd = useCallback(async (caught: Fish[]) => {
    const r = await fetch('/api/aquarium', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caught, duration_secs: TEND.gameSecs }) })
    const res: FishResult = await r.json()
    setResult(res); setState(res.state); setPage('result')
  }, [])

  if (status === 'loading' || page === 'loading' || !state) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-xl animate-pulse">載入水族箱中…</div>
  if (page === 'fishing') return <FishingView unlocked={state.unlocked} landmarker={landmarker} isLoading={isLoading} lmError={lmError} onEnd={handleEnd} />
  if (page === 'result' && result) return <ResultView r={result} onBack={() => setPage('tank')} onHome={() => router.push('/')} />
  return <TankHome state={state} onFish={() => setPage('fishing')} onChanged={setState} />
}
