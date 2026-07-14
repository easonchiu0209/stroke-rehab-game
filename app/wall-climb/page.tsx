'use client'

// 骨科 O1｜爬牆挑戰（肩關節活動度，五十肩/肩部術後訓練導向）
// 玩法：抬手帶動小登山者沿牆上爬，抬到目標角度撐住 1 秒＝登頂一次，
//       放回身側再爬（強制完整 ROM 循環）。突破個人歷史角度有慶祝。
// 量測：肩屈曲/外展角度（webcam 2D 估算，非醫療量測 — UI 已標示），
//       session 結束把本場最大角度寫入 rom_records（含 SQL 待套用時的優雅降級）。

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCamera } from '@/hooks/useCamera'
import { usePoseLandmarker } from '@/hooks/usePoseLandmarker'
import { useArmRaiseDetector } from '@/hooks/useArmRaiseDetector'
import { saveGameSession } from '@/lib/saveSession'
import { feedbackHit, speak } from '@/lib/feedback'
import JuiceLayer, { type JuiceHandle } from '@/components/game/JuiceLayer'

type Difficulty = 'easy' | 'medium' | 'hard'
type Phase = 'config' | 'countdown' | 'playing' | 'ended'

interface Cfg {
  label: string
  sublabel: string
  targetDeg: number   // 登頂目標角度
  holdMs: number      // 目標區停留時間
  badge: string
}

const CFGS: Record<Difficulty, Cfg> = {
  easy:   { label: 'Level 1', sublabel: '目標 90°（平舉）',   targetDeg: 90,  holdMs: 1000, badge: 'bg-green-100 text-green-800' },
  medium: { label: 'Level 2', sublabel: '目標 120°',          targetDeg: 120, holdMs: 1000, badge: 'bg-blue-100 text-blue-800' },
  hard:   { label: 'Level 3', sublabel: '目標 150°（過頭）',  targetDeg: 150, holdMs: 1500, badge: 'bg-purple-100 text-purple-800' },
}

const MAX_DEG = 165          // 牆頂對應角度
const REARM_DEG = 40         // 放下到此角度以下才能開始下一次

const GAME_SECS = 60

export default function WallClimbPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('config')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [results, setResults] = useState<{ reps: number; maxDeg: number; prevBest: number | null } | null>(null)

  if (phase === 'config') {
    return (
      <ConfigView
        difficulty={difficulty}
        setDifficulty={setDifficulty}
        onStart={() => setPhase('countdown')}
        onBack={() => router.push('/')}
      />
    )
  }
  if (phase === 'countdown' || phase === 'playing') {
    return (
      <PlayingView
        key={difficulty}
        cfg={CFGS[difficulty]}
        difficulty={difficulty}
        phase={phase}
        setPhase={setPhase}
        onEnd={(reps, maxDeg, prevBest) => { setResults({ reps, maxDeg, prevBest }); setPhase('ended') }}
      />
    )
  }
  return (
    <ResultsView
      difficulty={difficulty}
      reps={results?.reps ?? 0}
      maxDeg={results?.maxDeg ?? 0}
      prevBest={results?.prevBest ?? null}
      onReplay={() => { setResults(null); setPhase('countdown') }}
      onHome={() => router.push('/')}
    />
  )
}

// ── Config ──────────────────────────────────────────────────────────────────

function ConfigView({ difficulty, setDifficulty, onStart, onBack }: {
  difficulty: Difficulty
  setDifficulty: (d: Difficulty) => void
  onStart: () => void
  onBack: () => void
}) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-slate-50 flex flex-col items-center px-5 py-10 gap-6 game-menu-screen game-theme-summit">
      <div className="text-center">
        <div className="text-6xl mb-2">🧗</div>
        <h1 className="text-4xl font-extrabold text-slate-900">爬牆挑戰</h1>
        <p className="text-slate-500 mt-1">抬起手臂帶小登山者爬上山頂，訓練肩關節活動度</p>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-500 mb-3">訓練目標</p>
        <div className="flex gap-2 flex-wrap">
          {['肩屈曲', '肩外展', '活動範圍', '五十肩訓練', '肩部術後'].map(t => (
            <span key={t} className="text-xs font-semibold bg-sky-100 text-sky-800 px-3 py-1 rounded-full">{t}</span>
          ))}
        </div>
      </div>

      <div className="w-full max-w-lg">
        <p className="text-base font-semibold text-slate-700 mb-3">選擇目標高度</p>
        <div className="flex flex-col gap-3">
          {(Object.entries(CFGS) as [Difficulty, Cfg][]).map(([key, c]) => {
            const active = difficulty === key
            return (
              <button key={key} onClick={() => setDifficulty(key)}
                className={`text-left p-4 rounded-2xl border-2 transition-all ${
                  active ? 'border-sky-400 bg-sky-50 shadow-md' : 'border-slate-200 bg-white hover:border-sky-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{c.label}</span>
                  <span className="font-semibold text-slate-600">{c.sublabel}</span>
                  {active && <span className="ml-auto text-xs font-bold bg-sky-500 text-white px-2 py-0.5 rounded-full">已選</span>}
                </div>
                <p className="text-sm text-slate-500 mt-1">抬到目標角度撐住 {c.holdMs / 1000} 秒＝登頂一次，放下再爬</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="w-full max-w-lg bg-amber-50 rounded-xl p-4">
        <p className="text-sm text-amber-800 leading-relaxed">
          ⚠️ 有疼痛請立即停止並告訴你的治療師。角度為鏡頭估算，僅供訓練參考，非醫療量測。
          側身或正面對鏡頭皆可，讓「肩膀到手肘」完整入鏡。
        </p>
      </div>

      <div className="flex gap-3 w-full max-w-lg">
        <button onClick={onBack} className="flex-1 py-4 rounded-xl border-2 border-slate-300 text-slate-700 font-semibold text-lg hover:bg-slate-50 active:scale-[0.97]">
          ← 返回
        </button>
        <button onClick={onStart} className="flex-[2] py-4 rounded-xl bg-sky-600 text-white font-extrabold text-xl shadow-lg hover:bg-sky-700 active:scale-[0.97]">
          開始訓練 →
        </button>
      </div>
    </main>
  )
}

// ── Playing ─────────────────────────────────────────────────────────────────

function PlayingView({ cfg, difficulty, phase, setPhase, onEnd }: {
  cfg: Cfg
  difficulty: Difficulty
  phase: 'countdown' | 'playing'
  setPhase: (p: Phase) => void
  onEnd: (reps: number, maxDeg: number, prevBest: number | null) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const juiceRef = useRef<JuiceHandle>(null)

  const { isReady, error: cameraError, startCamera, stopCamera } = useCamera(videoRef)
  const { landmarker, isLoading, error: lmError } = usePoseLandmarker()

  const [countdown, setCountdown] = useState(3)
  const [timeLeft, setTimeLeft] = useState(GAME_SECS)
  const [reps, setReps] = useState(0)
  const [maxDeg, setMaxDeg] = useState(0)
  const [holdPct, setHoldPct] = useState(0)      // 目標區停留進度 0–1
  const [prevBest, setPrevBest] = useState<number | null>(null)

  const phaseRef = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])
  const repsRef = useRef(0)
  const maxDegRef = useRef(0)
  const armedRef = useRef(true)        // true = 可開始新的一次（已放下）
  const holdStartRef = useRef(-1)
  const beatBestRef = useRef(false)
  const endedRef = useRef(false)

  const isActive = isReady && !!landmarker && !isLoading && !lmError
  const { bodyDetected, angle, getAngle } = useArmRaiseDetector({ landmarker, videoRef, isActive })

  useEffect(() => { startCamera('user'); return () => stopCamera() }, [])  // eslint-disable-line

  // 歷史最佳（rom_records；表未建時回 null，功能優雅降級）
  useEffect(() => {
    fetch('/api/rom?joint=shoulder&motion=flexion')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && typeof d.best === 'number') setPrevBest(d.best) })
      .catch(() => { /* ignore */ })
  }, [])

  // 倒數
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) { setPhase('playing'); speak('開始囉，慢慢把手舉高'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown, setPhase])

  // 計時
  useEffect(() => {
    if (phase !== 'playing') return
    if (timeLeft <= 0) {
      if (!endedRef.current) { endedRef.current = true; onEnd(repsRef.current, Math.round(maxDegRef.current), prevBest) }
      return
    }
    const t = setTimeout(() => setTimeLeft(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, timeLeft, onEnd, prevBest])

  // 登頂狀態機（100ms tick 讀平滑角度）
  useEffect(() => {
    if (phase !== 'playing') return
    const timer = setInterval(() => {
      const a = getAngle()
      // 本場最高（破歷史紀錄慶祝一次）
      if (a > maxDegRef.current) {
        maxDegRef.current = a
        setMaxDeg(Math.round(a))
        if (prevBest != null && a > prevBest + 3 && !beatBestRef.current) {
          beatBestRef.current = true
          juiceRef.current?.burst(0.5, 0.18, { emojis: ['🏆', '✨'], count: 22 })
          juiceRef.current?.floatText(0.5, 0.12, '新紀錄！', { color: '#f59e0b', size: 40 })
          speak('太棒了，突破你的紀錄！')
        }
      }
      // 登頂判定
      if (armedRef.current) {
        if (a >= cfg.targetDeg) {
          if (holdStartRef.current < 0) holdStartRef.current = performance.now()
          const held = performance.now() - holdStartRef.current
          setHoldPct(Math.min(1, held / cfg.holdMs))
          if (held >= cfg.holdMs) {
            armedRef.current = false
            holdStartRef.current = -1
            setHoldPct(0)
            repsRef.current += 1
            setReps(repsRef.current)
            feedbackHit()
            juiceRef.current?.burst(0.5, 0.22, { emojis: ['⛰️', '✨'] })
            juiceRef.current?.floatText(0.5, 0.16, '登頂！', { color: '#0ea5e9' })
            speak('登頂成功，慢慢放下來')
          }
        } else {
          holdStartRef.current = -1
          setHoldPct(0)
        }
      } else if (a <= REARM_DEG) {
        armedRef.current = true   // 放下完成，可開始下一次
      }
    }, 100)
    return () => clearInterval(timer)
  }, [phase, cfg.targetDeg, cfg.holdMs, getAngle, prevBest])

  const pct = Math.min(1, angle / MAX_DEG)
  const targetPct = cfg.targetDeg / MAX_DEG
  const bestPct = prevBest != null ? Math.min(1, prevBest / MAX_DEG) : null

  return (
    <main className="min-h-screen flex flex-col bg-gradient-to-b from-sky-200 to-sky-50 game-play-screen game-theme-summit">
      {/* HUD */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur">
        <div className="text-center">
          <p className="text-xs text-slate-500 font-semibold">目前角度</p>
          <p className="text-3xl font-black text-sky-700">{angle}°</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 font-semibold">登頂</p>
          <p className="text-3xl font-black text-emerald-600">{reps}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 font-semibold">本場最高</p>
          <p className="text-3xl font-black text-amber-600">{maxDeg}°</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 font-semibold">剩餘</p>
          <p className="text-3xl font-black text-slate-700">{timeLeft}</p>
        </div>
      </div>

      {/* 山牆 */}
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-0" />
        <JuiceLayer ref={juiceRef} />

        {/* 山體 */}
        <div className="absolute inset-x-8 bottom-0 top-6">
          <div className="relative h-full mx-auto max-w-md">
            {/* 山頂旗 */}
            <div className="absolute left-1/2 -translate-x-1/2 text-4xl" style={{ top: 0 }}>🚩</div>
            {/* 牆面 */}
            <div className="absolute left-1/2 -translate-x-1/2 top-10 bottom-4 w-24 rounded-t-[3rem] bg-gradient-to-b from-stone-400 to-stone-600 shadow-inner">
              {/* 岩點 */}
              {[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map(p => (
                <div key={p} className="absolute left-1/2 -translate-x-1/2 w-10 h-2.5 rounded-full bg-stone-700/60" style={{ top: `${p * 100}%` }} />
              ))}
            </div>
            {/* 目標線 */}
            <div className="absolute inset-x-0" style={{ top: `${(1 - targetPct) * 100}%` }}>
              <div className="border-t-4 border-dashed border-emerald-500/80 relative">
                <span className="absolute right-0 -top-7 text-xs font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                  目標 {cfg.targetDeg}°
                </span>
              </div>
            </div>
            {/* 歷史最佳線 */}
            {bestPct != null && (
              <div className="absolute inset-x-0" style={{ top: `${(1 - bestPct) * 100}%` }}>
                <div className="border-t-2 border-dotted border-amber-500/80 relative">
                  <span className="absolute left-0 -top-6 text-xs font-bold text-amber-700">🏆 {prevBest}°</span>
                </div>
              </div>
            )}
            {/* 登山者（角度驅動） */}
            <div
              className="absolute left-1/2 -translate-x-1/2 text-5xl transition-[top] duration-150 ease-out"
              style={{ top: `calc(${(1 - pct) * 100}% - 28px)` }}
            >
              🧗
              {/* 停留進度環 */}
              {holdPct > 0 && (
                <div className="absolute -right-8 top-1 w-6 h-6 rounded-full border-4 border-emerald-200"
                  style={{ background: `conic-gradient(#10b981 ${holdPct * 360}deg, transparent 0deg)` }} />
              )}
            </div>
          </div>
        </div>

        {/* 倒數遮罩 */}
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-20">
            <p className="text-white text-2xl mb-4 opacity-80">手放身側，準備開始</p>
            <div className="text-yellow-300 text-9xl font-black">{countdown > 0 ? countdown : '出發！'}</div>
          </div>
        )}

        {/* 鏡頭/模型狀態 */}
        {phase === 'playing' && (cameraError || lmError) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20 px-8 text-center">
            <p className="text-white text-lg">{cameraError?.message ?? lmError}</p>
          </div>
        )}
        {phase === 'playing' && !bodyDetected && !cameraError && !lmError && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/70 text-white text-base font-semibold px-5 py-2.5 rounded-2xl z-20">
            📷 請退後一點，讓上半身入鏡
          </div>
        )}
      </div>
    </main>
  )
}

// ── Results ─────────────────────────────────────────────────────────────────

function ResultsView({ difficulty, reps, maxDeg, prevBest, onReplay, onHome }: {
  difficulty: Difficulty
  reps: number
  maxDeg: number
  prevBest: number | null
  onReplay: () => void
  onHome: () => void
}) {
  const savedRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)
  const [pain, setPain] = useState<number | null>(null)
  const [painDone, setPainDone] = useState(false)
  const newRecord = prevBest != null ? maxDeg > prevBest : maxDeg > 0

  useEffect(() => {
    if (savedRef.current) return
    savedRef.current = true
    speak(reps > 0 ? '做得很好，今天的肩膀有努力喔' : '完成囉，下次再挑戰')
    saveGameSession({
      game_type: 'wall-climb',
      difficulty,
      score: reps * 10,
      hits: reps,
      misses: 0,
      duration_secs: GAME_SECS,
      highest_reach: Math.min(100, Math.round((maxDeg / MAX_DEG) * 100)),
      rom: maxDeg > 0 ? { joint: 'shoulder', motion: 'flexion', angle_deg: maxDeg } : undefined,
    }).then(r => { if (r?.session_id) sessionIdRef.current = r.session_id })
  }, [difficulty, reps, maxDeg])

  // 疼痛 NRS 回報（0–10）：選了就補寫到這場 session
  async function reportPain(n: number) {
    setPain(n)
    setPainDone(true)
    if (sessionIdRef.current) {
      try {
        await fetch('/api/game/pain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionIdRef.current, pain: n }),
        })
      } catch { /* 離線時略過 */ }
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-slate-50 flex flex-col items-center justify-center px-6 gap-6 game-menu-screen game-theme-summit">
      <div className="text-center">
        <div className="text-6xl mb-2">{newRecord ? '🏆' : '⛰️'}</div>
        <h1 className="text-3xl font-extrabold text-slate-900">{newRecord ? '新紀錄！' : '完成訓練！'}</h1>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-6 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-4xl font-black text-emerald-600">{reps}</p>
          <p className="text-sm text-slate-500 font-semibold mt-1">登頂次數</p>
        </div>
        <div>
          <p className="text-4xl font-black text-sky-700">{maxDeg}°</p>
          <p className="text-sm text-slate-500 font-semibold mt-1">本場最高</p>
        </div>
        <div>
          <p className="text-4xl font-black text-amber-600">{prevBest != null ? `${prevBest}°` : '—'}</p>
          <p className="text-sm text-slate-500 font-semibold mt-1">先前最佳</p>
        </div>
      </div>

      {/* 疼痛 NRS 快速回報（骨科必備） */}
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        {!painDone ? (
          <>
            <p className="font-bold text-slate-800 mb-1">這次訓練肩膀會痛嗎？</p>
            <p className="text-xs text-slate-400 mb-3">0＝完全不痛，10＝非常痛</p>
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: 11 }, (_, n) => (
                <button key={n} onClick={() => reportPain(n)}
                  className={`py-2.5 rounded-xl font-black text-lg active:scale-95 ${
                    n === 0 ? 'bg-green-100 text-green-700'
                    : n <= 3 ? 'bg-lime-100 text-lime-700'
                    : n <= 6 ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
                  }`}>
                  {n}
                </button>
              ))}
            </div>
          </>
        ) : pain != null && pain >= 4 ? (
          <p className="text-amber-800 font-semibold leading-relaxed">
            已記錄（疼痛 {pain} 分）。疼痛達 4 分以上，<strong>請記得告訴你的治療師</strong>，先暫停這個動作的練習。
          </p>
        ) : (
          <p className="text-emerald-700 font-semibold">已記錄，謝謝回報！{pain === 0 ? '完全不痛，太好了 👍' : ''}</p>
        )}
      </div>

      <p className="text-xs text-slate-400 max-w-md text-center">角度為鏡頭估算，僅供訓練參考，非醫療量測。</p>

      <div className="flex gap-3 w-full max-w-md">
        <button onClick={onHome} className="flex-1 py-4 rounded-xl border-2 border-slate-300 text-slate-700 font-semibold text-lg hover:bg-slate-50 active:scale-[0.97]">
          🏠 返回首頁
        </button>
        <button onClick={onReplay} className="flex-[2] py-4 rounded-xl bg-sky-600 text-white font-extrabold text-xl shadow-lg hover:bg-sky-700 active:scale-[0.97]">
          🔄 再玩一次
        </button>
      </div>
    </main>
  )
}
