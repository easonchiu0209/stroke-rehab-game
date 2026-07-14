'use client'

// 節奏復能鼓（rhythm-drum）— rhythm 機制首發（GAME-FACTORY §1：以 static 為底加節拍計時）
// 玩法：霓虹音符沿光軌落向左右鼓面，音符到達鼓面的瞬間伸手揮擊命中，雙手左右交替。
// 復健目標：雙側節奏交替揮擊、動作計時；hard 加入中央鼓位（跨中線誘導）。
// 視覺：ART-STYLE-BIBLE §7 rhythm-drum 條目 — calm 暗底＋霓虹色板（§1.4）＋節拍呼吸背景（≤3Hz）
//       ＋beat 命中 combo 光效（§4）＋鼓面 juiceSquash/hit-stop（§5.4，僅 combo 里程碑）。
// 音訊：沿用平台 Web Audio 做法（lib/feedback + 頁內節拍音），不引入新依賴。

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { useCamera } from '@/hooks/useCamera'
import { useMoleDetector, type MoleTarget } from '@/hooks/useMoleDetector'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { saveGameSession, computeZones } from '@/lib/saveSession'
import { usePoseMonitor } from '@/hooks/usePoseMonitor'
import CompensationHint from '@/components/game/CompensationHint'
import JuiceLayer, { type JuiceHandle } from '@/components/game/JuiceLayer'
import { useDdaRecommendation } from '@/hooks/useFlowDda'
import { feedbackHit, feedbackCombo, speak } from '@/lib/feedback'
import { SceneBack, SceneFront } from '@/components/game/GameScene'

// ── Types ──────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard'
type GamePhase  = 'countdown' | 'playing' | 'ended'
type PagePhase  = 'config' | 'playing' | 'results'
type PadId      = 'L' | 'C' | 'R'

interface Cfg {
  label:       string
  sublabel:    string
  cueMs:       number     // 音符間隔（節拍速度）
  perfectMs:   number     // ±內算「完美」
  goodMs:      number     // ±內算「不錯」（同時是可擊窗口）
  hitRadiusPx: number     // 640 寬基準的鼓面判定半徑
  pattern:     PadId[]    // 出拍序（循環）：雙側交替；hard 帶中央（跨中線）
  gameSecs:    number
  badgeColor:  string
}

const CFGS: Record<Difficulty, Cfg> = {
  easy:   { label: 'Level 1', sublabel: '慢板・左右交替',   cueMs: 1800, perfectMs: 220, goodMs: 520, hitRadiusPx: 80, pattern: ['L', 'R'],                     gameSecs: 60, badgeColor: 'bg-green-100 text-green-800' },
  medium: { label: 'Level 2', sublabel: '中板・左右交替',   cueMs: 1250, perfectMs: 180, goodMs: 450, hitRadiusPx: 66, pattern: ['L', 'R'],                     gameSecs: 60, badgeColor: 'bg-blue-100 text-blue-800' },
  hard:   { label: 'Level 3', sublabel: '快板・含中央鼓',   cueMs: 950,  perfectMs: 150, goodMs: 400, hitRadiusPx: 56, pattern: ['L', 'R', 'C', 'R', 'L', 'C'], gameSecs: 60, badgeColor: 'bg-purple-100 text-purple-800' },
}

const LEAD_MS = 1600   // 音符從光軌頂落到鼓面的時間（提示提前量）

// 鼓位（display-space 常數）＋霓虹配色（聖經 §1.4：青／洋紅／紫，僅暗底使用）
const PADS: Record<PadId, { nx: number; ny: number; neon: string; label: string }> = {
  L: { nx: 0.22, ny: 0.68, neon: '#22D3EE', label: '左' },
  C: { nx: 0.50, ny: 0.68, neon: '#A78BFA', label: '中' },
  R: { nx: 0.78, ny: 0.68, neon: '#F472B6', label: '右' },
}

type Judge = 'perfect' | 'good' | 'early'

interface HitRecord {
  pad:      PadId
  nx:       number
  ny:       number
  offsetMs: number    // 命中時間 − 拍點（負＝早）
  judge:    Judge
}

interface GameResults {
  hits:       number
  misses:     number
  score:      number
  maxCombo:   number
  hitRecords: HitRecord[]
  difficulty: Difficulty
}

interface CueNote {
  id:     number
  pad:    PadId
  beatAt: number   // performance.now() 拍點時刻
}

// ── PlayingView ─────────────────────────────────────────────────────────────

interface PlayingViewProps {
  cfg:                 Cfg
  difficulty:          Difficulty
  landmarker:          HandLandmarker | null
  isLandmarkerLoading: boolean
  landmarkerError:     string | null
  onGameEnd:           (results: GameResults) => void
}

function PlayingView({
  cfg,
  difficulty,
  landmarker,
  isLandmarkerLoading,
  landmarkerError,
  onGameEnd,
}: PlayingViewProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const juiceRef  = useRef<JuiceHandle>(null)

  const { isReady, error: cameraError, startCamera, stopCamera, isMirrored } = useCamera(videoRef)

  // ── Game state ────────────────────────────────────────────────────
  const [gamePhase, setGamePhase] = useState<GamePhase>('countdown')
  const [countdown, setCountdown] = useState(3)
  const [timeLeft,  setTimeLeft]  = useState(cfg.gameSecs)
  const [score,     setScore]     = useState(0)
  const [combo,     setCombo]     = useState(0)
  const [hitCount,  setHitCount]  = useState(0)
  const [notes,     setNotes]     = useState<CueNote[]>([])            // 落下中的霓虹音符（視覺）
  const [cues,      setCuesState] = useState<MoleTarget[]>([])         // 可擊窗口內的目標（給 detector）
  const [padFlash,  setPadFlash]  = useState<Record<PadId, number>>({ L: 0, C: 0, R: 0 })
  const [lastJudge, setLastJudge] = useState<{ text: string; color: string } | null>(null)
  const [noHandWarn, setNoHandWarn] = useState(false)

  // Refs for timer callbacks
  const gamePhaseRef  = useRef<GamePhase>('countdown')
  const scoreRef      = useRef(0)
  const comboRef      = useRef(0)
  const maxComboRef   = useRef(0)
  const hitCountRef   = useRef(0)
  const missCountRef  = useRef(0)
  const hitRecordsRef = useRef<HitRecord[]>([])
  const notePadRef    = useRef(new Map<number, PadId>())                       // note id → 鼓位
  const timersRef     = useRef<ReturnType<typeof setTimeout>[]>([])
  const noteSeqRef    = useRef(1)
  const endedRef      = useRef(false)
  const noHandWarnRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioRef      = useRef<AudioContext | null>(null)
  const judgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { gamePhaseRef.current = gamePhase }, [gamePhase])

  // 背景 Pose 監測：動作錄製 + 代償偵測（倒數階段收基準線）
  const { hint: poseHint } = usePoseMonitor({
    videoRef, isMirrored,
    active: gamePhase === 'countdown' || gamePhase === 'playing',
  })

  // Camera（契約 §3：前鏡頭＋動態鏡像）
  useEffect(() => {
    startCamera('user')
    return () => { stopCamera() }
  }, [startCamera, stopCamera])

  // ── 鼓聲（Web Audio 短音，無音檔、無新依賴）────────────────────────
  const drumTone = useCallback((accent: boolean) => {
    try {
      if (!audioRef.current) audioRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const ctx = audioRef.current
      if (ctx.state === 'suspended') ctx.resume()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(accent ? 180 : 140, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.16)
      gain.gain.setValueAtTime(0.28, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
      osc.connect(gain).connect(ctx.destination)
      osc.start(); osc.stop(ctx.currentTime + 0.22)
    } catch { /* 無音訊支援時只看視覺 */ }
  }, [])

  const showJudge = useCallback((text: string, color: string) => {
    setLastJudge({ text, color })
    if (judgeTimerRef.current) clearTimeout(judgeTimerRef.current)
    judgeTimerRef.current = setTimeout(() => setLastJudge(null), 900)
  }, [])

  // ── 命中處理 ───────────────────────────────────────────────────────
  const handleHit = useCallback((noteId: number, offsetMs: number) => {
    if (gamePhaseRef.current !== 'playing') return
    const padId = notePadRef.current.get(noteId)
    if (!padId) return
    notePadRef.current.delete(noteId)
    const pad = PADS[padId]

    // 移除音符與可擊目標
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
    setCuesState((prev) => prev.filter((c) => c.id !== noteId))

    // 時機判定（offsetMs = 命中 − 拍點；detector 的 spawnTime 已設為拍點）
    const abs = Math.abs(offsetMs)
    let judge: Judge; let pts: number
    if (abs <= cfg.perfectMs)      { judge = 'perfect'; pts = 20 }
    else if (abs <= cfg.goodMs * 0.85) { judge = 'good'; pts = 10 }
    else                            { judge = 'early'; pts = 5 }   // 窗口邊緣（多半是提早搶拍）

    hitCountRef.current += 1
    setHitCount(hitCountRef.current)
    scoreRef.current += pts
    setScore(scoreRef.current)
    hitRecordsRef.current.push({ pad: padId, nx: pad.nx, ny: pad.ny, offsetMs, judge })

    // 鼓面受擊閃亮（juiceSquash 由 CSS class 觸發）
    setPadFlash((prev) => ({ ...prev, [padId]: performance.now() }))

    if (judge === 'early') {
      // 溫和提示，不懲罰、combo 不中斷歸零但也不累積
      showJudge('再等一下，跟著拍子', '#94A3B8')
      juiceRef.current?.floatText(pad.nx, pad.ny - 0.08, '+5', { color: '#94A3B8', size: 28 })
      juiceRef.current?.burst(pad.nx, pad.ny, { count: 8, colors: [pad.neon], emojis: ['✨'] })
      return
    }

    comboRef.current += 1
    maxComboRef.current = Math.max(maxComboRef.current, comboRef.current)
    setCombo(comboRef.current)
    feedbackHit()

    if (judge === 'perfect') {
      showJudge('✨ 完美節拍！', pad.neon)
      juiceRef.current?.burst(pad.nx, pad.ny, { count: 16, colors: [pad.neon, '#FFFFFF'], emojis: ['✨'] })
      juiceRef.current?.floatText(pad.nx, pad.ny - 0.08, '+20', { color: '#FFD600', size: 36 })
    } else {
      showJudge('👍 不錯！', '#A3E635')
      juiceRef.current?.burst(pad.nx, pad.ny, { count: 12, colors: [pad.neon] })
      juiceRef.current?.floatText(pad.nx, pad.ny - 0.08, '+10', { color: '#FFD600', size: 30 })
    }
    juiceRef.current?.shake(0.4)

    // Combo 里程碑：霓虹 comboBurst（§4），×10 的倍數加 hit-stop（§5.4，克制）
    if (comboRef.current > 0 && comboRef.current % 5 === 0) {
      juiceRef.current?.comboBurst(pad.nx, pad.ny - 0.14, comboRef.current, { color: pad.neon })
      feedbackCombo(comboRef.current)
      if (comboRef.current % 10 === 0) juiceRef.current?.hitStop(90)
    }
  }, [cfg, showJudge])

  // ── Detection（沿用 useMoleDetector：目標=可擊窗口內的鼓拍）──────────
  const isDetectorActive =
    gamePhase === 'playing' &&
    isReady &&
    landmarker !== null &&
    !isLandmarkerLoading &&
    !landmarkerError

  const { handDetected, handNxDisplay, handNy, setMoles: syncDetector } = useMoleDetector({
    landmarker,
    videoRef,
    canvasRef,
    isActive: isDetectorActive,
    hitRadiusPx: cfg.hitRadiusPx + 16,   // 寬容緣
    isMirrored,
    onHit: handleHit,
  })

  useEffect(() => { syncDetector(cues) }, [cues, syncDetector])

  // ── 節拍出題器 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== 'playing') return
    const timers = timersRef.current
    let patternIdx = 0
    const gameEndAt = performance.now() + cfg.gameSecs * 1000

    const scheduleNote = () => {
      const beatAt = performance.now() + LEAD_MS
      if (beatAt > gameEndAt - 150) return   // 結束前不再出到不了的拍
      const padId = cfg.pattern[patternIdx % cfg.pattern.length]
      patternIdx += 1
      const id = noteSeqRef.current++
      notePadRef.current.set(id, padId)
      const pad = PADS[padId]

      setNotes((prev) => [...prev, { id, pad: padId, beatAt }])

      // 拍點瞬間：鼓聲（拍到拍不到都響，作為節拍器）
      timers.push(setTimeout(() => {
        if (gamePhaseRef.current === 'playing') drumTone(padId === 'C')
      }, LEAD_MS))

      // 可擊窗口開啟（拍點前 goodMs）：spawnTime 設為拍點 → detector 回傳的 reactionMs = 時間差
      timers.push(setTimeout(() => {
        if (gamePhaseRef.current !== 'playing') return
        setCuesState((prev) => [...prev, { id, nx: pad.nx, ny: pad.ny, spawnTime: beatAt }])
      }, LEAD_MS - cfg.goodMs))

      // 窗口關閉：未命中 → 漏拍（溫和，不懲罰）
      timers.push(setTimeout(() => {
        if (!notePadRef.current.has(id)) return   // 已命中
        notePadRef.current.delete(id)
        setNotes((prev) => prev.filter((n) => n.id !== id))
        setCuesState((prev) => prev.filter((c) => c.id !== id))
        if (gamePhaseRef.current !== 'playing') return
        missCountRef.current += 1
        comboRef.current = 0
        setCombo(0)
        juiceRef.current?.burst(pad.nx, pad.ny, { count: 8, colors: ['#616161', '#9e9e9e'], emojis: ['💨'] })
        showJudge('下一拍跟上！', '#94A3B8')
      }, LEAD_MS + cfg.goodMs))
    }

    scheduleNote()
    const interval = setInterval(scheduleNote, cfg.cueMs)
    return () => {
      clearInterval(interval)
      timers.forEach((t) => clearTimeout(t))
      timersRef.current = []
    }
  }, [gamePhase, cfg, drumTone, showJudge])

  // ── Countdown 3-2-1 ───────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== 'countdown') return
    if (countdown <= 0) { setGamePhase('playing'); return }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [gamePhase, countdown])

  // ── Game timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== 'playing') return
    if (timeLeft <= 0) { setGamePhase('ended'); return }
    const t = setTimeout(() => setTimeLeft((t) => t - 1), 1000)
    return () => clearTimeout(t)
  }, [gamePhase, timeLeft])

  // ── 結束回報 ───────────────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== 'ended' || endedRef.current) return
    endedRef.current = true
    onGameEnd({
      hits:       hitCountRef.current,
      misses:     missCountRef.current,
      score:      scoreRef.current,
      maxCombo:   maxComboRef.current,
      hitRecords: hitRecordsRef.current,
      difficulty,
    })
  }, [gamePhase, difficulty, onGameEnd])

  // ── No-hand warning ───────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== 'playing') return
    if (!handDetected) {
      noHandWarnRef.current = setTimeout(() => setNoHandWarn(true), 3000)
    } else {
      if (noHandWarnRef.current) { clearTimeout(noHandWarnRef.current); noHandWarnRef.current = null }
      setNoHandWarn(false)
    }
    return () => { if (noHandWarnRef.current) clearTimeout(noHandWarnRef.current) }
  }, [gamePhase, handDetected])

  const hasError    = !!(cameraError || landmarkerError)
  const isLoading   = !isReady || isLandmarkerLoading
  const cssRadiusPx = cfg.hitRadiusPx * 1.1
  const beatSecs    = cfg.cueMs / 1000   // 背景呼吸週期（≤3Hz 紅線：最快 950ms ≈ 1.05Hz，安全）
  const activePads: PadId[] = cfg.pattern.includes('C') ? ['L', 'C', 'R'] : ['L', 'R']

  return (
    <div className="flex flex-col w-full h-screen bg-slate-950 overflow-hidden select-none">

      {/* ── HUD ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-black/70 text-white shrink-0">
        <div>
          <p className="text-xs opacity-60">分數</p>
          <p className="text-4xl font-black text-yellow-400 leading-none">{score}</p>
        </div>
        <div className="text-center">
          {gamePhase === 'countdown' && (
            <p className="text-6xl font-black">{countdown > 0 ? countdown : '開始！'}</p>
          )}
          {gamePhase === 'playing' && (
            <>
              <p className="text-xs opacity-60">剩餘時間</p>
              <p className="text-5xl font-black leading-none">{timeLeft}</p>
            </>
          )}
          {gamePhase === 'ended' && (
            <p className="text-2xl font-bold text-yellow-400">演奏結束！</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs opacity-60">連擊</p>
          <p className="text-4xl font-black leading-none" style={{ color: combo >= 5 ? '#22D3EE' : '#4ADE80', textShadow: combo >= 5 ? '0 0 14px rgba(34,211,238,0.4)' : undefined }}>
            ×{combo}
          </p>
        </div>
      </div>

      {/* ── Game area ────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden bg-black">

        {/* 靜謐星夜暗底（聖經 §2.4 calm）＋節拍霓虹呼吸層 */}
        <SceneBack theme="calm" />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(circle at 50% 78%, rgba(34,211,238,0.20), rgba(167,139,250,0.08) 45%, transparent 68%)',
          animation: gamePhase === 'playing' ? `drumBreath ${beatSecs}s ease-in-out infinite` : 'none',
          opacity: 0.55,
        }} />

        {/* 鏡頭（僅供偵測，視覺隱藏）＋偵測 canvas（動態鏡像，契約 §3） */}
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" style={{ transform: isMirrored ? 'scaleX(-1)' : undefined, opacity: 0 }} />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ transform: isMirrored ? 'scaleX(-1)' : undefined, opacity: 0.35 }} />

        {/* 代償提醒（聳肩/前傾/側彎） */}
        <CompensationHint hint={poseHint} />

        {/* 命中特效層（粒子/彈跳字/微震） */}
        <JuiceLayer ref={juiceRef} />

        {/* 霓虹光軌（每個鼓位一條，音符沿軌落下） */}
        {activePads.map((padId) => {
          const pad = PADS[padId]
          return (
            <div key={`lane-${padId}`} className="absolute pointer-events-none" style={{
              left: `calc(${pad.nx * 100}% - 3px)`,
              top: '6%',
              height: `calc(${pad.ny * 100}% - 6%)`,
              width: 6,
              borderRadius: 3,
              background: `linear-gradient(to bottom, transparent, ${pad.neon}55 60%, ${pad.neon}88)`,
              boxShadow: `0 0 16px ${pad.neon}44`,
            }} />
          )
        })}

        {/* 落下中的霓虹音符 */}
        {notes.map((note) => {
          const pad = PADS[note.pad]
          return (
            <div
              key={note.id}
              className="absolute pointer-events-none"
              style={{
                left: `calc(${pad.nx * 100}% - 24px)`,
                width: 48, height: 48,
                borderRadius: '50%',
                background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.85), ${pad.neon} 55%)`,
                border: '3px solid rgba(255,255,255,0.75)',
                boxShadow: `0 0 22px ${pad.neon}66, 0 4px 8px rgba(0,0,0,0.35)`,
                animation: `noteFall ${LEAD_MS}ms linear both`,
                ['--fall-to' as string]: `calc(${pad.ny * 100}% - 24px)`,
              }}
            />
          )
        })}

        {/* 鼓面（呼吸光暈＋落地陰影＋圓潤高光三件套，聖經 §2） */}
        {activePads.map((padId) => {
          const pad = PADS[padId]
          const flashedAt = padFlash[padId]
          const justHit = performance.now() - flashedAt < 300
          return (
            <div
              key={`pad-${padId}`}
              className="absolute pointer-events-none"
              style={{
                left: `calc(${pad.nx * 100}% - ${cssRadiusPx}px)`,
                top: `calc(${pad.ny * 100}% - ${cssRadiusPx}px)`,
                width: cssRadiusPx * 2,
                height: cssRadiusPx * 2,
                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.35))',
              }}
            >
              {/* 呼吸光暈（對齊 BPM，targetPulse 式外擴光環，不閃爍） */}
              <div className="absolute inset-0" style={{
                borderRadius: '50%',
                animation: gamePhase === 'playing' ? `drumPulse-${padId} ${beatSecs}s ease-in-out infinite` : 'none',
              }} />
              {/* 鼓面本體：深色皮面＋霓虹圈邊＋左上圓潤高光 */}
              <div className="absolute inset-0" style={{
                borderRadius: '50%',
                background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.30), rgba(255,255,255,0.05) 45%), radial-gradient(circle, #1E293B, #0F172A 78%)`,
                border: `4px solid ${pad.neon}`,
                boxShadow: `0 0 24px ${pad.neon}66, inset 0 0 22px ${pad.neon}33`,
                transform: justHit ? 'scale(0.9)' : 'scale(1)',
                transition: 'transform 0.16s cubic-bezier(0.34,1.56,0.64,1)',
              }} />
              {/* 鼓位標示（不以顏色為唯一區辨，§1.5） */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-black text-white/85" style={{ fontSize: cssRadiusPx * 0.5, textShadow: `0 0 12px ${pad.neon}` }}>
                  {pad.label}
                </span>
              </div>
            </div>
          )
        })}

        {/* 時機判定文字 */}
        {lastJudge && gamePhase === 'playing' && (
          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ top: '30%' }}>
            <p className="text-3xl font-black whitespace-nowrap" style={{ color: lastJudge.color, textShadow: `0 0 18px ${lastJudge.color}66, 0 2px 4px rgba(0,0,0,0.6)` }}>
              {lastJudge.text}
            </p>
          </div>
        )}

        {/* Hand cursor */}
        {handDetected && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `calc(${handNxDisplay * 100}% - 26px)`,
              top: `calc(${handNy * 100}% - 26px)`,
              width: 52, height: 52,
              borderRadius: '50%',
              background: 'rgba(255,214,0,0.2)',
              border: '3px solid #FFD600',
              boxShadow: '0 0 18px rgba(255,214,0,0.5)',
            }}
          />
        )}

        {/* Loading / error overlay */}
        {(isLoading || hasError) && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 text-white z-30">
            {hasError ? (
              <>
                <p className="text-4xl">⚠️</p>
                <p className="text-xl font-semibold px-8 text-center">{cameraError?.message ?? landmarkerError}</p>
              </>
            ) : (
              <>
                <p className="text-4xl animate-pulse">⏳</p>
                <p className="text-xl">正在載入 AI 模型…</p>
              </>
            )}
          </div>
        )}

        {/* No-hand warning */}
        {noHandWarn && gamePhase === 'playing' && (
          <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-4 text-white z-30">
            <p className="text-5xl">👋</p>
            <p className="text-2xl font-semibold">未偵測到手部</p>
            <p className="text-lg opacity-80">請將手放到鏡頭前方</p>
          </div>
        )}

        {/* Countdown overlay */}
        {gamePhase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-20">
            <p className="text-2xl mb-4 opacity-80">音符落到鼓面時揮擊，左右手輪流！</p>
            <p className="text-9xl font-black text-yellow-400" style={{ textShadow: '0 0 40px rgba(255,214,0,0.7)' }}>
              {countdown > 0 ? countdown : '開始！'}
            </p>
          </div>
        )}

        {/* 中央聚焦暈影 */}
        <SceneFront theme="calm" />
      </div>

      {/* Keyframes：音符落下＋鼓面節拍呼吸＋背景霓虹呼吸（皆平滑、無 >3Hz 閃爍） */}
      <style>{`
        @keyframes noteFall {
          from { top: 6%; opacity: 0.35; }
          15%  { opacity: 1; }
          to   { top: var(--fall-to); opacity: 1; }
        }
        @keyframes drumBreath {
          0%, 100% { opacity: 0.35; }
          50%      { opacity: 0.75; }
        }
        ${activePads.map((p) => `
        @keyframes drumPulse-${p} {
          0%, 100% { transform: scale(1);    box-shadow: 0 0 0 0    ${PADS[p].neon}59; }
          50%      { transform: scale(1.04); box-shadow: 0 0 0 14px ${PADS[p].neon}00; }
        }`).join('\n')}
      `}</style>
    </div>
  )
}

// ── ConfigView ──────────────────────────────────────────────────────────────

function ConfigView({
  onStart,
  onBack,
  recommended,
}: {
  onStart: (d: Difficulty) => void
  onBack:  () => void
  recommended: Difficulty | null
}) {
  const [selected, setSelected] = useState<Difficulty>('easy')
  const touchedRef = useRef(false)

  useEffect(() => {
    if (recommended && !touchedRef.current) setSelected(recommended)
  }, [recommended])

  const diffOptions: { key: Difficulty; emoji: string; desc: string }[] = [
    { key: 'easy',   emoji: '🟢', desc: '慢板節拍・左右兩鼓交替・大鼓面' },
    { key: 'medium', emoji: '🔵', desc: '中板節拍・左右兩鼓交替・中鼓面' },
    { key: 'hard',   emoji: '🟣', desc: '快板節拍・加入中央鼓（跨中線）・小鼓面' },
  ]

  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-10 gap-7 bg-gradient-to-b from-violet-50 to-gray-50">
      <div className="text-center">
        <p className="text-5xl mb-3">🪘</p>
        <h1 className="text-3xl font-extrabold text-gray-900">節奏復能鼓</h1>
        <p className="text-gray-500 mt-1.5">跟著霓虹音符的節拍，左右手輪流揮擊鼓面</p>
      </div>

      {/* Training targets */}
      <div className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-500 mb-3">訓練目標</p>
        <div className="flex gap-3 flex-wrap">
          {['雙側交替揮擊', '動作節奏感', '動作計時', '跨中線（進階）', '左右協調'].map((t) => (
            <span key={t} className="text-xs font-semibold bg-violet-100 text-violet-800 px-3 py-1 rounded-full">{t}</span>
          ))}
        </div>
      </div>

      {/* Difficulty selection */}
      <div className="w-full max-w-xl">
        <p className="text-sm font-semibold text-gray-600 mb-3">選擇難度</p>
        <div className="flex flex-col gap-3">
          {diffOptions.map(({ key, emoji, desc }) => {
            const c = CFGS[key]
            const active = selected === key
            return (
              <button
                key={key}
                onClick={() => { touchedRef.current = true; setSelected(key) }}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  active ? 'border-violet-500 bg-violet-50' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span>{emoji}</span>
                  <span className="font-bold text-gray-900">{c.label} {c.sublabel}</span>
                  {recommended === key && (
                    <span className="text-xs font-bold bg-amber-400 text-amber-950 px-2 py-0.5 rounded-full">⭐ AI 建議</span>
                  )}
                  {active && <span className="ml-auto text-xs font-bold text-violet-600">已選</span>}
                </div>
                <p className="text-sm text-gray-500">{desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Game info card */}
      <div className="w-full max-w-xl bg-blue-50 rounded-xl p-4">
        <p className="text-sm text-blue-700 leading-relaxed">
          💡 霓虹音符會沿著光軌落向鼓面，音符「落到鼓面的那一刻」伸手碰到鼓就算命中。
          左邊的鼓用左手、右邊的鼓用右手，輪流出手效果最好。坐著玩就可以囉。
        </p>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 w-full max-w-xl">
        <button
          onClick={onBack}
          className="flex-1 py-4 rounded-xl border-2 border-gray-300 text-gray-700 font-semibold text-lg hover:bg-gray-50 active:scale-[0.97] transition-all"
        >
          ← 返回
        </button>
        <button
          onClick={() => onStart(selected)}
          className="flex-[2] py-4 rounded-xl bg-violet-600 text-white font-extrabold text-xl shadow-lg hover:bg-violet-700 active:scale-[0.97] transition-all"
        >
          開始訓練 →
        </button>
      </div>
    </main>
  )
}

// ── ResultsView ─────────────────────────────────────────────────────────────

function ResultsView({
  results,
  onReplay,
  onHome,
}: {
  results:  GameResults
  onReplay: () => void
  onHome:   () => void
}) {
  const { hits, misses, score, maxCombo, hitRecords, difficulty } = results
  const cfg      = CFGS[difficulty]
  const attempts = hits + misses
  const accuracy = attempts > 0 ? Math.round((hits / attempts) * 100) : 0

  const perfects = hitRecords.filter((r) => r.judge === 'perfect').length
  const avgOffset = hitRecords.length > 0
    ? Math.round(hitRecords.reduce((s, r) => s + Math.abs(r.offsetMs), 0) / hitRecords.length)
    : 0

  // 左右分布與交替率（雙側交替是本遊戲的復健核心指標）
  const leftHits   = hitRecords.filter((r) => r.pad === 'L').length
  const rightHits  = hitRecords.filter((r) => r.pad === 'R').length
  const centerHits = hitRecords.filter((r) => r.pad === 'C').length
  const alternations = hitRecords.reduce((n, r, i) => (i > 0 && r.pad !== hitRecords[i - 1].pad ? n + 1 : n), 0)
  const alternatePct = hitRecords.length > 1 ? Math.round((alternations / (hitRecords.length - 1)) * 100) : 0

  const getRating = () => {
    if (accuracy >= 85) return { emoji: '🏆', text: '節奏大師！' }
    if (accuracy >= 70) return { emoji: '🌟', text: '非常好！' }
    if (accuracy >= 50) return { emoji: '👍', text: '做得好！' }
    return { emoji: '💪', text: '繼續加油！' }
  }
  const { emoji, text } = getRating()

  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-8 gap-5 bg-gradient-to-b from-violet-50 to-gray-50">

      {/* Header */}
      <div className="text-center">
        <p className="text-5xl mb-2">{emoji}</p>
        <h1 className="text-3xl font-extrabold text-gray-900">{text}</h1>
        <p className="text-gray-500 mt-1">節奏復能鼓 · {cfg.label} {cfg.sublabel}</p>
      </div>

      {/* Score */}
      <div className="bg-violet-600 rounded-2xl px-16 py-4 text-center shadow-lg">
        <p className="text-sm text-violet-200">總分</p>
        <p className="text-6xl font-black text-yellow-400 leading-none">{score}</p>
        <p className="text-sm text-violet-200">分</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
        {[
          { label: '命中節拍', value: `${hits} 拍`,  color: 'text-green-700',  bg: 'bg-green-50' },
          { label: '節奏準確率', value: `${accuracy}%`, color: 'text-purple-700', bg: 'bg-purple-50' },
          { label: '完美命中', value: `${perfects} 次`, color: 'text-cyan-700',  bg: 'bg-cyan-50' },
          { label: '最高連擊', value: `×${maxCombo}`,  color: 'text-orange-700', bg: 'bg-orange-50' },
          { label: '平均時間差', value: avgOffset > 0 ? `${avgOffset} ms` : '—', color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: '左右交替率', value: hitRecords.length > 1 ? `${alternatePct}%` : '—', color: 'text-pink-700', bg: 'bg-pink-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4 text-center`}>
            <p className="text-sm text-gray-500 mb-1">{label}</p>
            <p className={`text-3xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* 左右分布（雙側訓練核心指標） */}
      {hitRecords.length > 0 && (
        <div className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-600 mb-4">左右手分布</p>
          <div className="flex gap-3">
            {[
              { label: '左鼓', count: leftHits,   color: '#0891B2' },
              { label: '中央鼓', count: centerHits, color: '#7C3AED' },
              { label: '右鼓', count: rightHits,  color: '#DB2777' },
            ].map(({ label, count, color }) => {
              const pct = Math.round((count / Math.max(1, hitRecords.length)) * 100)
              return (
                <div key={label} className="flex-1 text-center">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <div className="h-20 bg-gray-100 rounded-lg relative overflow-hidden">
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t-md transition-all duration-700"
                      style={{ height: `${Math.max(pct, count > 0 ? 8 : 0)}%`, background: color }}
                    />
                  </div>
                  <p className="text-lg font-bold mt-1" style={{ color }}>{count}</p>
                  <p className="text-xs text-gray-400">{pct}%</p>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            💡 兩側越平均、交替率越高，代表雙手輪流出力越順暢
          </p>
        </div>
      )}

      {/* Timing feedback */}
      {avgOffset > 0 && (
        <p className="text-base text-gray-600 text-center">
          {avgOffset < 150 ? '🎵 節奏感非常精準！'
          : avgOffset < 300 ? '🎵 節奏感很不錯！'
          : avgOffset < 450 ? '👌 抓拍子越來越穩了'
          :                   '🌱 多聽鼓聲，跟著拍子出手'}
        </p>
      )}

      {/* Buttons */}
      <div className="flex gap-3 w-full max-w-xl mt-2">
        <button
          onClick={onHome}
          className="flex-1 py-4 rounded-xl border-2 border-gray-300 text-gray-700 font-semibold text-lg hover:bg-gray-50 active:scale-[0.97] transition-all"
        >
          🏠 返回首頁
        </button>
        <button
          onClick={onReplay}
          className="flex-[2] py-4 rounded-xl bg-violet-600 text-white font-extrabold text-xl shadow-lg hover:bg-violet-700 active:scale-[0.97] transition-all"
        >
          🔄 再玩一次
        </button>
      </div>
    </main>
  )
}

// ── Page root ───────────────────────────────────────────────────────────────

export default function RhythmDrumPage() {
  const router = useRouter()
  const [pagePhase,   setPagePhase]   = useState<PagePhase>('config')
  const [difficulty,  setDifficulty]  = useState<Difficulty>('easy')
  const [gameResults, setGameResults] = useState<GameResults | null>(null)

  const { landmarker, isLoading, error: landmarkerError } = useHandLandmarker()
  const { recommended } = useDdaRecommendation('rhythm-drum')
  const spokeResultRef = useRef(false)

  const handleStart = useCallback((d: Difficulty) => {
    setDifficulty(d)
    setPagePhase('playing')
    speak('跟著鼓聲，左右手輪流打！')
  }, [])

  const handleGameEnd = useCallback((results: GameResults) => {
    setGameResults(results)
    setPagePhase('results')

    // 結算語音鼓勵（每場僅播一次）
    if (!spokeResultRef.current) {
      spokeResultRef.current = true
      const attempts = results.hits + results.misses
      const accuracy = attempts > 0 ? Math.round((results.hits / attempts) * 100) : 0
      speak(accuracy >= 80 ? '節奏感太棒了，做得很好！' : '完成囉，節奏越打越穩！')
    }

    // 存訓練數據（game_sessions 既有通道）：命中率/時間差/左右分布
    const avgOffsetMs = results.hitRecords.length > 0
      ? Math.round(results.hitRecords.reduce((s, r) => s + Math.abs(r.offsetMs), 0) / results.hitRecords.length)
      : null
    saveGameSession({
      game_type:       'rhythm-drum',
      difficulty:      results.difficulty,
      score:           results.score,
      hits:            results.hits,
      misses:          results.misses,
      avg_reaction_ms: avgOffsetMs,   // 節奏遊戲：平均「與拍點的時間差」
      duration_secs:   CFGS[results.difficulty].gameSecs,
      ...computeZones(results.hitRecords.map((r) => ({ nx: r.nx, ny: r.ny }))),
    })
  }, [])

  const handleReplay = useCallback(() => {
    setGameResults(null)
    setPagePhase('playing')
    spokeResultRef.current = false
    speak('跟著鼓聲，左右手輪流打！')
  }, [])

  if (pagePhase === 'config') {
    return <ConfigView onStart={handleStart} onBack={() => router.push('/')} recommended={recommended} />
  }

  if (pagePhase === 'playing') {
    return (
      <PlayingView
        key={`${difficulty}-${gameResults ? 'replay' : 'first'}`}
        cfg={CFGS[difficulty]}
        difficulty={difficulty}
        landmarker={landmarker}
        isLandmarkerLoading={isLoading}
        landmarkerError={landmarkerError}
        onGameEnd={handleGameEnd}
      />
    )
  }

  if (pagePhase === 'results' && gameResults) {
    return (
      <ResultsView
        results={gameResults}
        onReplay={handleReplay}
        onHome={() => router.push('/')}
      />
    )
  }

  return null
}
