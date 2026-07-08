'use client'

// 骨科 O2｜坐到站（30 秒坐站測試數位化，全膝/全髖置換與長者下肢肌力導向）
// 玩法：30 秒內完成越多次「坐→站→坐」越高分。開場坐姿自動校正，
//       髖膝距離變化偵測起立/坐回；存 次數 + 平均節奏。
// 安全：需穩固椅子、建議旁有扶手/陪同（安全須知必勾）；數據為鏡頭估算非醫療量測。

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCamera } from '@/hooks/useCamera'
import { usePoseLandmarker } from '@/hooks/usePoseLandmarker'
import { useSitStandDetector } from '@/hooks/useSitStandDetector'
import { saveGameSession } from '@/lib/saveSession'
import { feedbackHit, speak } from '@/lib/feedback'
import JuiceLayer, { type JuiceHandle } from '@/components/game/JuiceLayer'

type Phase = 'config' | 'countdown' | 'playing' | 'ended'
const GAME_SECS = 30

export default function SitToStandPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('config')
  const [results, setResults] = useState<{ stands: number; avgMs: number | null } | null>(null)

  if (phase === 'config') {
    return <ConfigView onStart={() => setPhase('countdown')} onBack={() => router.push('/')} />
  }
  if (phase === 'countdown' || phase === 'playing') {
    return (
      <PlayingView phase={phase} setPhase={setPhase}
        onEnd={(stands, avgMs) => { setResults({ stands, avgMs }); setPhase('ended') }} />
    )
  }
  return (
    <ResultsView stands={results?.stands ?? 0} avgMs={results?.avgMs ?? null}
      onReplay={() => { setResults(null); setPhase('countdown') }} onHome={() => router.push('/')} />
  )
}

function ConfigView({ onStart, onBack }: { onStart: () => void; onBack: () => void }) {
  const [safety, setSafety] = useState(false)
  return (
    <main className="min-h-screen bg-gradient-to-b from-teal-50 to-slate-50 flex flex-col items-center px-5 py-10 gap-6">
      <div className="text-center">
        <div className="text-6xl mb-2">🪑</div>
        <h1 className="text-4xl font-extrabold text-slate-900">坐到站</h1>
        <p className="text-slate-500 mt-1">30 秒坐站挑戰，訓練下肢肌力與起身能力</p>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-500 mb-3">訓練目標</p>
        <div className="flex gap-2 flex-wrap">
          {['下肢肌力', '起身能力', '膝髖控制', '術後恢復期'].map(t => (
            <span key={t} className="text-xs font-semibold bg-teal-100 text-teal-800 px-3 py-1 rounded-full">{t}</span>
          ))}
        </div>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-500 mb-2">怎麼玩</p>
        <ol className="text-sm text-slate-600 leading-relaxed list-decimal list-inside space-y-1">
          <li>坐在穩固的椅子上，側面或正面對鏡頭，全身入鏡</li>
          <li>倒數結束後保持坐姿 2 秒讓系統校正</li>
          <li>聽到開始後：站起來→完全坐回去，30 秒內越多次越好</li>
          <li>雙手可交叉胸前（標準做法）或扶椅子（安全優先）</li>
        </ol>
      </div>

      <label className="w-full max-w-lg bg-amber-50 rounded-xl p-4 flex gap-3 items-start cursor-pointer">
        <input type="checkbox" checked={safety} onChange={e => setSafety(e.target.checked)} className="mt-1 w-5 h-5 accent-amber-600" />
        <span className="text-sm text-amber-800 leading-relaxed">
          我已了解：<strong>使用穩固不滑動的椅子</strong>（建議靠牆），旁邊有扶手或家人陪同更安全。
          膝髖術後請依治療師指示進行，任何疼痛、頭暈請立即停止。
        </span>
      </label>

      <div className="flex gap-3 w-full max-w-lg">
        <button onClick={onBack} className="flex-1 py-4 rounded-xl border-2 border-slate-300 text-slate-700 font-semibold text-lg hover:bg-slate-50 active:scale-[0.97]">← 返回</button>
        <button onClick={onStart} disabled={!safety}
          className="flex-[2] py-4 rounded-xl bg-teal-600 text-white font-extrabold text-xl shadow-lg hover:bg-teal-700 active:scale-[0.97] disabled:opacity-40">
          開始挑戰 →
        </button>
      </div>
    </main>
  )
}

function PlayingView({ phase, setPhase, onEnd }: {
  phase: 'countdown' | 'playing'
  setPhase: (p: Phase) => void
  onEnd: (stands: number, avgMs: number | null) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const juiceRef = useRef<JuiceHandle>(null)

  const { isReady, error: cameraError, startCamera, stopCamera } = useCamera(videoRef)
  const { landmarker, isLoading, error: lmError } = usePoseLandmarker()

  const [countdown, setCountdown] = useState(3)
  const [timeLeft, setTimeLeft] = useState(GAME_SECS)
  const [stands, setStands] = useState(0)
  const [isUp, setIsUp] = useState(false)

  const standsRef = useRef(0)
  const standTimesRef = useRef<number[]>([])
  const timerStartedRef = useRef(false)
  const endedRef = useRef(false)
  const phaseRef = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])

  const isActive = isReady && !!landmarker && !isLoading && !lmError && phase === 'playing'

  const { bodyDetected, calibrated } = useSitStandDetector({
    landmarker, videoRef, isActive,
    onStand: (t) => {
      if (phaseRef.current !== 'playing' || !timerStartedRef.current) return
      setIsUp(true)
      standsRef.current += 1
      standTimesRef.current.push(t)
      setStands(standsRef.current)
      feedbackHit()
      juiceRef.current?.burst(0.5, 0.4, { emojis: ['⬆️', '✨'] })
      juiceRef.current?.floatText(0.5, 0.3, `第 ${standsRef.current} 次！`, { color: '#0d9488' })
    },
    onSit: () => setIsUp(false),
  })

  useEffect(() => { startCamera('user'); return () => stopCamera() }, [])  // eslint-disable-line

  // 倒數
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) { setPhase('playing'); speak('請坐好不要動，系統校正中'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown, setPhase])

  // 校正完成才開始 30 秒計時
  useEffect(() => {
    if (phase === 'playing' && calibrated && !timerStartedRef.current) {
      timerStartedRef.current = true
      speak('開始！站起來再坐下')
    }
  }, [phase, calibrated])

  useEffect(() => {
    if (phase !== 'playing' || !timerStartedRef.current) return
    if (timeLeft <= 0) {
      if (!endedRef.current) {
        endedRef.current = true
        const times = standTimesRef.current
        let avg: number | null = null
        if (times.length >= 2) {
          const gaps = times.slice(1).map((t, i) => t - times[i])
          avg = Math.round(gaps.reduce((s, v) => s + v, 0) / gaps.length)
        }
        onEnd(standsRef.current, avg)
      }
      return
    }
    const t = setTimeout(() => setTimeLeft(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, timeLeft, calibrated, onEnd, stands])

  return (
    <main className="min-h-screen flex flex-col bg-gradient-to-b from-teal-100 to-teal-50">
      <div className="flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur">
        <div className="text-center"><p className="text-xs text-slate-500 font-semibold">完成次數</p><p className="text-3xl font-black text-teal-700">{stands}</p></div>
        <div className="text-center"><p className="text-xs text-slate-500 font-semibold">狀態</p><p className="text-3xl">{isUp ? '🧍' : '🪑'}</p></div>
        <div className="text-center"><p className="text-xs text-slate-500 font-semibold">剩餘</p><p className="text-3xl font-black text-slate-700">{timerStartedRef.current ? timeLeft : GAME_SECS}</p></div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-0" />
        <JuiceLayer ref={juiceRef} />

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
          <div className="text-9xl transition-transform duration-200" style={{ transform: isUp ? 'translateY(-30px)' : 'none' }}>
            {isUp ? '🧍' : '🪑'}
          </div>
          {phase === 'playing' && !timerStartedRef.current && (
            <p className="text-xl font-bold text-teal-800 bg-white/80 px-5 py-2 rounded-2xl">
              {calibrated ? '開始！' : '請坐好不要動，校正中…'}
            </p>
          )}
        </div>

        {phase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-20">
            <p className="text-white text-2xl mb-4 opacity-80">坐在椅子上，全身入鏡</p>
            <div className="text-yellow-300 text-9xl font-black">{countdown > 0 ? countdown : '準備！'}</div>
          </div>
        )}

        {phase === 'playing' && (cameraError || lmError) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20 px-8 text-center">
            <p className="text-white text-lg">{cameraError?.message ?? lmError}</p>
          </div>
        )}
        {phase === 'playing' && !bodyDetected && !cameraError && !lmError && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/70 text-white text-base font-semibold px-5 py-2.5 rounded-2xl z-20">
            📷 請退後，讓髖部和膝蓋都入鏡
          </div>
        )}
      </div>
    </main>
  )
}

function ResultsView({ stands, avgMs, onReplay, onHome }: {
  stands: number; avgMs: number | null; onReplay: () => void; onHome: () => void
}) {
  const savedRef = useRef(false)

  useEffect(() => {
    if (savedRef.current) return
    savedRef.current = true
    speak(stands >= 8 ? '腿力很棒！' : '完成挑戰了，持續練習力氣會回來')
    void saveGameSession({
      game_type: 'sit-to-stand',
      difficulty: 'medium',            // 標準 30 秒版
      score: stands * 10,
      hits: stands,
      misses: 0,
      duration_secs: GAME_SECS,
      avg_reaction_ms: avgMs,          // 平均每次坐站節奏（ms）
    })
  }, [stands, avgMs])

  return (
    <main className="min-h-screen bg-gradient-to-b from-teal-50 to-slate-50 flex flex-col items-center justify-center px-6 gap-6">
      <div className="text-center">
        <div className="text-6xl mb-2">🪑</div>
        <h1 className="text-3xl font-extrabold text-slate-900">完成挑戰！</h1>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-6 grid grid-cols-2 gap-4 text-center">
        <div><p className="text-4xl font-black text-teal-700">{stands}</p><p className="text-sm text-slate-500 font-semibold mt-1">30 秒完成次數</p></div>
        <div><p className="text-4xl font-black text-sky-700">{avgMs != null ? `${(avgMs / 1000).toFixed(1)}s` : '—'}</p><p className="text-sm text-slate-500 font-semibold mt-1">平均每次節奏</p></div>
      </div>

      <p className="text-xs text-slate-400 max-w-md text-center">次數為鏡頭估算，僅供訓練參考，非醫療量測。趨勢請與你的治療師討論。</p>

      <div className="flex gap-3 w-full max-w-md">
        <button onClick={onHome} className="flex-1 py-4 rounded-xl border-2 border-slate-300 text-slate-700 font-semibold text-lg hover:bg-slate-50 active:scale-[0.97]">🏠 返回首頁</button>
        <button onClick={onReplay} className="flex-[2] py-4 rounded-xl bg-teal-600 text-white font-extrabold text-xl shadow-lg hover:bg-teal-700 active:scale-[0.97]">🔄 再挑戰</button>
      </div>
    </main>
  )
}
