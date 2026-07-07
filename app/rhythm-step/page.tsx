'use client'

// 神經 N1｜節奏踏步（下肢/步態節奏）
// 玩法：跟著節拍原地踏步（坐姿抬腿優先，安全），踩在拍點上得分。
// 偵測：Pose 髖-膝距離變化（useStepDetector），左右分開計數 → 對稱性指標。
// 難度：BPM / 抬腿幅度。含安全須知頁（需勾選）。

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCamera } from '@/hooks/useCamera'
import { usePoseLandmarker } from '@/hooks/usePoseLandmarker'
import { useStepDetector } from '@/hooks/useStepDetector'
import { saveGameSession } from '@/lib/saveSession'
import { feedbackHit, speak } from '@/lib/feedback'
import JuiceLayer, { type JuiceHandle } from '@/components/game/JuiceLayer'

type Difficulty = 'easy' | 'medium' | 'hard'
type Phase = 'config' | 'countdown' | 'playing' | 'ended'

interface Cfg {
  label: string
  sublabel: string
  bpm: number
  liftRatio: number    // 抬腿判定寬鬆度（越小要抬越高）
  badge: string
}

const CFGS: Record<Difficulty, Cfg> = {
  easy:   { label: 'Level 1', sublabel: '慢板 50 拍', bpm: 50, liftRatio: 0.72, badge: 'bg-green-100 text-green-800' },
  medium: { label: 'Level 2', sublabel: '中板 70 拍', bpm: 70, liftRatio: 0.66, badge: 'bg-blue-100 text-blue-800' },
  hard:   { label: 'Level 3', sublabel: '快板 90 拍', bpm: 90, liftRatio: 0.60, badge: 'bg-purple-100 text-purple-800' },
}

const GAME_SECS = 60
const BEAT_WINDOW_MS = 280   // 拍點 ± 此值內算「踩在拍上」

export default function RhythmStepPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('config')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [results, setResults] = useState<{ steps: number; onBeat: number; left: number; right: number } | null>(null)

  if (phase === 'config') {
    return <ConfigView difficulty={difficulty} setDifficulty={setDifficulty} onStart={() => setPhase('countdown')} onBack={() => router.push('/')} />
  }
  if (phase === 'countdown' || phase === 'playing') {
    return (
      <PlayingView key={difficulty} cfg={CFGS[difficulty]} phase={phase} setPhase={setPhase}
        onEnd={(steps, onBeat, left, right) => { setResults({ steps, onBeat, left, right }); setPhase('ended') }} />
    )
  }
  return (
    <ResultsView difficulty={difficulty}
      steps={results?.steps ?? 0} onBeat={results?.onBeat ?? 0} left={results?.left ?? 0} right={results?.right ?? 0}
      onReplay={() => { setResults(null); setPhase('countdown') }} onHome={() => router.push('/')} />
  )
}

// ── Config（含安全須知）────────────────────────────────────────────────────

function ConfigView({ difficulty, setDifficulty, onStart, onBack }: {
  difficulty: Difficulty; setDifficulty: (d: Difficulty) => void; onStart: () => void; onBack: () => void
}) {
  const [safety, setSafety] = useState(false)
  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-slate-50 flex flex-col items-center px-5 py-10 gap-6">
      <div className="text-center">
        <div className="text-6xl mb-2">🥁</div>
        <h1 className="text-4xl font-extrabold text-slate-900">節奏踏步</h1>
        <p className="text-slate-500 mt-1">跟著節拍抬腿踏步，訓練下肢節奏與左右協調</p>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-500 mb-3">訓練目標</p>
        <div className="flex gap-2 flex-wrap">
          {['下肢抬腿', '步態節奏', '左右對稱', '動作計時'].map(t => (
            <span key={t} className="text-xs font-semibold bg-orange-100 text-orange-800 px-3 py-1 rounded-full">{t}</span>
          ))}
        </div>
      </div>

      <div className="w-full max-w-lg">
        <p className="text-base font-semibold text-slate-700 mb-3">選擇節拍</p>
        <div className="flex flex-col gap-3">
          {(Object.entries(CFGS) as [Difficulty, Cfg][]).map(([key, c]) => {
            const active = difficulty === key
            return (
              <button key={key} onClick={() => setDifficulty(key)}
                className={`text-left p-4 rounded-2xl border-2 transition-all ${active ? 'border-orange-400 bg-orange-50 shadow-md' : 'border-slate-200 bg-white hover:border-orange-200'}`}>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{c.label}</span>
                  <span className="font-semibold text-slate-600">{c.sublabel}</span>
                  {active && <span className="ml-auto text-xs font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full">已選</span>}
                </div>
                <p className="text-sm text-slate-500 mt-1">每分鐘 {c.bpm} 拍，左右腳輪流跟上節奏</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* 安全須知（必勾） */}
      <label className="w-full max-w-lg bg-amber-50 rounded-xl p-4 flex gap-3 items-start cursor-pointer">
        <input type="checkbox" checked={safety} onChange={e => setSafety(e.target.checked)} className="mt-1 w-5 h-5 accent-amber-600" />
        <span className="text-sm text-amber-800 leading-relaxed">
          我已了解：<strong>建議坐在穩固有靠背的椅子上進行</strong>（坐姿抬大腿即可）。
          站姿進行請確保旁邊有扶手或家人陪同，任何頭暈、疼痛請立即停止並告訴治療師。
        </span>
      </label>

      <div className="flex gap-3 w-full max-w-lg">
        <button onClick={onBack} className="flex-1 py-4 rounded-xl border-2 border-slate-300 text-slate-700 font-semibold text-lg hover:bg-slate-50 active:scale-[0.97]">← 返回</button>
        <button onClick={onStart} disabled={!safety}
          className="flex-[2] py-4 rounded-xl bg-orange-500 text-white font-extrabold text-xl shadow-lg hover:bg-orange-600 active:scale-[0.97] disabled:opacity-40">
          開始訓練 →
        </button>
      </div>
    </main>
  )
}

// ── Playing ─────────────────────────────────────────────────────────────────

function PlayingView({ cfg, phase, setPhase, onEnd }: {
  cfg: Cfg
  phase: 'countdown' | 'playing'
  setPhase: (p: Phase) => void
  onEnd: (steps: number, onBeat: number, left: number, right: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const juiceRef = useRef<JuiceHandle>(null)

  const { isReady, error: cameraError, startCamera, stopCamera } = useCamera(videoRef)
  const { landmarker, isLoading, error: lmError } = usePoseLandmarker()

  const [countdown, setCountdown] = useState(3)
  const [timeLeft, setTimeLeft] = useState(GAME_SECS)
  const [stepCounts, setStepCounts] = useState({ total: 0, onBeat: 0, L: 0, R: 0 })
  const [beatFlash, setBeatFlash] = useState(false)
  const [lastJudge, setLastJudge] = useState<'perfect' | 'ok' | null>(null)

  const countsRef = useRef({ total: 0, onBeat: 0, L: 0, R: 0 })
  const beatTimesRef = useRef<number[]>([])       // 已播放拍點（相對遊戲開始 ms）
  const gameStartRef = useRef(-1)
  const endedRef = useRef(false)
  const audioRef = useRef<AudioContext | null>(null)
  const phaseRef = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])

  const isActive = isReady && !!landmarker && !isLoading && !lmError && phase === 'playing'

  // 節拍聲（AudioContext 短音）
  const tick = useCallback((accent: boolean) => {
    try {
      if (!audioRef.current) audioRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const ctx = audioRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = accent ? 880 : 660
      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
      osc.connect(gain).connect(ctx.destination)
      osc.start(); osc.stop(ctx.currentTime + 0.13)
    } catch { /* 無音訊支援時只看視覺 */ }
  }, [])

  const handleStep = useCallback((side: 'L' | 'R', tMs: number) => {
    if (phaseRef.current !== 'playing') return
    const c = countsRef.current
    c.total += 1
    c[side] += 1
    // 找最近拍點
    const nearest = beatTimesRef.current.reduce((best, b) => Math.abs(b - tMs) < Math.abs(best - tMs) ? b : best, -99999)
    const onBeat = Math.abs(nearest - tMs) <= BEAT_WINDOW_MS
    if (onBeat) {
      c.onBeat += 1
      feedbackHit()
      setLastJudge('perfect')
      juiceRef.current?.floatText(side === 'L' ? 0.3 : 0.7, 0.45, '太準了！', { color: '#f97316', size: 30 })
    } else {
      setLastJudge('ok')
    }
    juiceRef.current?.burst(side === 'L' ? 0.3 : 0.7, 0.62, { count: 8, emojis: ['👟'] })
    setStepCounts({ ...c })
  }, [])

  const { bodyDetected } = useStepDetector({ landmarker, videoRef, isActive, liftRatio: cfg.liftRatio, onStep: handleStep })

  useEffect(() => { startCamera('user'); return () => stopCamera() }, [])  // eslint-disable-line

  // 倒數
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) { setPhase('playing'); speak('跟著鼓聲，左右腳輪流抬'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown, setPhase])

  // 計時
  useEffect(() => {
    if (phase !== 'playing') return
    if (timeLeft <= 0) {
      if (!endedRef.current) {
        endedRef.current = true
        const c = countsRef.current
        onEnd(c.total, c.onBeat, c.L, c.R)
      }
      return
    }
    const t = setTimeout(() => setTimeLeft(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, timeLeft, onEnd])

  // 節拍器
  useEffect(() => {
    if (phase !== 'playing') return
    gameStartRef.current = performance.now()
    beatTimesRef.current = []
    const intervalMs = 60000 / cfg.bpm
    let n = 0
    const timer = setInterval(() => {
      const t = performance.now() - gameStartRef.current
      beatTimesRef.current.push(t)
      if (beatTimesRef.current.length > 8) beatTimesRef.current.shift()   // 只留近 8 拍
      tick(n % 4 === 0)
      n++
      setBeatFlash(true)
      setTimeout(() => setBeatFlash(false), 140)
    }, intervalMs)
    return () => clearInterval(timer)
  }, [phase, cfg.bpm, tick])

  const rhythmPct = stepCounts.total ? Math.round((stepCounts.onBeat / stepCounts.total) * 100) : 0

  return (
    <main className="min-h-screen flex flex-col bg-gradient-to-b from-orange-100 to-amber-50">
      {/* HUD */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur">
        <div className="text-center"><p className="text-xs text-slate-500 font-semibold">踏步</p><p className="text-3xl font-black text-orange-600">{stepCounts.total}</p></div>
        <div className="text-center"><p className="text-xs text-slate-500 font-semibold">踩準節拍</p><p className="text-3xl font-black text-emerald-600">{rhythmPct}%</p></div>
        <div className="text-center"><p className="text-xs text-slate-500 font-semibold">左｜右</p><p className="text-3xl font-black text-sky-700">{stepCounts.L}｜{stepCounts.R}</p></div>
        <div className="text-center"><p className="text-xs text-slate-500 font-semibold">剩餘</p><p className="text-3xl font-black text-slate-700">{timeLeft}</p></div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-0" />
        <JuiceLayer ref={juiceRef} />

        {/* 節拍視覺：大鼓 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
          <div className={`text-9xl transition-transform duration-100 ${beatFlash ? 'scale-125' : 'scale-100'}`}>🥁</div>
          <p className="text-2xl font-extrabold text-orange-700">{cfg.bpm} 拍／分鐘</p>
          {lastJudge && (
            <p className={`text-xl font-black ${lastJudge === 'perfect' ? 'text-emerald-600' : 'text-slate-500'}`}>
              {lastJudge === 'perfect' ? '✨ 踩在拍上！' : '👟 有踏到，跟上節奏～'}
            </p>
          )}
          <div className="flex gap-16 text-6xl">
            <span className="opacity-80">🦵</span>
            <span className="opacity-80" style={{ transform: 'scaleX(-1)' }}>🦵</span>
          </div>
        </div>

        {phase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-20">
            <p className="text-white text-2xl mb-4 opacity-80">坐穩了嗎？聽鼓聲抬腿</p>
            <div className="text-yellow-300 text-9xl font-black">{countdown > 0 ? countdown : '開始！'}</div>
          </div>
        )}

        {phase === 'playing' && (cameraError || lmError) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20 px-8 text-center">
            <p className="text-white text-lg">{cameraError?.message ?? lmError}</p>
          </div>
        )}
        {phase === 'playing' && !bodyDetected && !cameraError && !lmError && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/70 text-white text-base font-semibold px-5 py-2.5 rounded-2xl z-20">
            📷 請退後，讓大腿和膝蓋入鏡
          </div>
        )}
      </div>
    </main>
  )
}

// ── Results ─────────────────────────────────────────────────────────────────

function ResultsView({ difficulty, steps, onBeat, left, right, onReplay, onHome }: {
  difficulty: Difficulty
  steps: number; onBeat: number; left: number; right: number
  onReplay: () => void; onHome: () => void
}) {
  const savedRef = useRef(false)
  const rhythmPct = steps ? Math.round((onBeat / steps) * 100) : 0
  const symmetry = left + right > 0 ? Math.round((Math.min(left, right) / Math.max(left, right, 1)) * 100) : 0

  useEffect(() => {
    if (savedRef.current) return
    savedRef.current = true
    speak(steps > 0 ? '腳步很棒，節奏感越來越好了' : '完成囉，下次跟著鼓聲試試')
    void saveGameSession({
      game_type: 'rhythm-step',
      difficulty,
      score: onBeat * 10 + (steps - onBeat) * 3,
      hits: onBeat,
      misses: Math.max(0, steps - onBeat),
      duration_secs: GAME_SECS,
      left_hits: left,
      right_hits: right,
      center_hits: 0,
    })
  }, [difficulty, steps, onBeat, left, right])

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-slate-50 flex flex-col items-center justify-center px-6 gap-6">
      <div className="text-center">
        <div className="text-6xl mb-2">🥁</div>
        <h1 className="text-3xl font-extrabold text-slate-900">完成訓練！</h1>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-6 grid grid-cols-2 gap-4 text-center">
        <div><p className="text-4xl font-black text-orange-600">{steps}</p><p className="text-sm text-slate-500 font-semibold mt-1">總踏步</p></div>
        <div><p className="text-4xl font-black text-emerald-600">{rhythmPct}%</p><p className="text-sm text-slate-500 font-semibold mt-1">節奏準確率</p></div>
        <div><p className="text-4xl font-black text-sky-700">{left}｜{right}</p><p className="text-sm text-slate-500 font-semibold mt-1">左｜右 踏步</p></div>
        <div><p className="text-4xl font-black text-purple-600">{symmetry}%</p><p className="text-sm text-slate-500 font-semibold mt-1">左右對稱</p></div>
      </div>

      <div className="flex gap-3 w-full max-w-md">
        <button onClick={onHome} className="flex-1 py-4 rounded-xl border-2 border-slate-300 text-slate-700 font-semibold text-lg hover:bg-slate-50 active:scale-[0.97]">🏠 返回首頁</button>
        <button onClick={onReplay} className="flex-[2] py-4 rounded-xl bg-orange-500 text-white font-extrabold text-xl shadow-lg hover:bg-orange-600 active:scale-[0.97]">🔄 再玩一次</button>
      </div>
    </main>
  )
}
