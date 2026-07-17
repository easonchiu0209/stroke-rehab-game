'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCamera } from '@/hooks/useCamera'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { PinchPointer, usePinchPointer } from '@/hooks/usePinchPointer'
import { feedbackHit, speak } from '@/lib/feedback'

type InputMode = 'camera' | 'pointer'
type FishingStage = 'cast' | 'wait' | 'bite' | 'reel' | 'complete'

interface FishingSpot {
  id: string
  x: number
  y: number
  label: string
  hint: string
  fish: string
  fishName: string
}

const FISHING_SPOTS: FishingSpot[] = [
  { id: 'reeds', x: 0.24, y: 0.42, label: '蘆葦灣', hint: '安靜水面', fish: '🐟', fishName: '銀光魚' },
  { id: 'deep', x: 0.5, y: 0.31, label: '深水潭', hint: '神秘水域', fish: '🐠', fishName: '彩紋魚' },
  { id: 'sunny', x: 0.73, y: 0.46, label: '陽光灘', hint: '水波活躍', fish: '🐡', fishName: '圓圓魚' },
]

const STAGE_COPY: Record<Exclude<FishingStage, 'complete'>, { eyebrow: string; title: string; instruction: string }> = {
  cast: {
    eyebrow: '步驟 1 / 3 · 選點拋竿',
    title: '把浮標拖到想釣的水域',
    instruction: '三個釣點會遇到不同魚。捏住浮標，拖到光圈後放開。',
  },
  wait: {
    eyebrow: '步驟 2 / 3 · 觀察',
    title: '先別收線，看看浮標',
    instruction: '魚正在靠近。咬鉤後浮標會明顯下沉，不需要搶時間。',
  },
  bite: {
    eyebrow: '步驟 2 / 3 · 咬鉤',
    title: '魚咬鉤了，按住浮標',
    instruction: '咬鉤提示會一直保留，準備好再按住浮標即可。',
  },
  reel: {
    eyebrow: '步驟 3 / 3 · 控制收線',
    title: '抓住捲線器，向下拉三次',
    instruction: '每次從上方抓住把手，慢慢拉到下方再放開，不限速度。',
  },
}

function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by)
}

function CameraFishing({ onExit }: { onExit: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { landmarker, isLoading, error: modelError } = useHandLandmarker()
  const { isReady, error: cameraError, isMirrored, startCamera, stopCamera } = useCamera(videoRef)
  const handPoint = usePinchPointer({ landmarker, videoRef, isActive: isReady && !!landmarker, isMirrored })

  useEffect(() => {
    startCamera('user')
    return () => stopCamera()
  }, [startCamera, stopCamera])

  return (
    <FishingMission
      inputMode="camera"
      handPoint={handPoint}
      inputStatus={cameraError?.message ?? modelError ?? (isLoading || !isReady ? '正在準備鏡頭與手部辨識…' : null)}
      video={<video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover opacity-[0.1]" style={{ transform: isMirrored ? 'scaleX(-1)' : undefined }} />}
      onExit={onExit}
    />
  )
}

function FishingMission({
  inputMode,
  handPoint,
  inputStatus,
  video,
  onExit,
}: {
  inputMode: InputMode
  handPoint?: PinchPointer
  inputStatus?: string | null
  video?: React.ReactNode
  onExit: () => void
}) {
  const router = useRouter()
  const boardRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<FishingStage>('cast')
  const [bobber, setBobber] = useState({ x: 0.82, y: 0.76 })
  const [draggingBobber, setDraggingBobber] = useState(false)
  const [selectedSpot, setSelectedSpot] = useState<FishingSpot | null>(null)
  const [pullCount, setPullCount] = useState(0)
  const [handleY, setHandleY] = useState(0.34)
  const [message, setMessage] = useState('先選一個你想探索的釣點。')
  const inputDownRef = useRef(false)
  const pullArmedRef = useRef(false)
  const startedAtRef = useRef(Date.now())
  const savedRef = useRef(false)

  useEffect(() => {
    if (stage !== 'wait') return
    const timer = window.setTimeout(() => {
      setStage('bite')
      setMessage('浮標下沉了！準備好再按住它。')
      feedbackHit()
      speak('魚咬鉤了，準備好再按住浮標。')
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [stage])

  const finishCatch = useCallback(() => {
    feedbackHit()
    setStage('complete')
    setMessage('收線完成，魚上岸了！')
    speak(`收線完成，釣到${selectedSpot?.fishName ?? '一尾魚'}！`)
  }, [selectedSpot])

  const pressInput = useCallback((x: number, y: number) => {
    inputDownRef.current = true
    if (stage === 'cast' && distance(x, y, bobber.x, bobber.y) < 0.14) {
      setDraggingBobber(true)
      setMessage('拖到其中一個釣點，再放開浮標。')
    } else if (stage === 'bite' && distance(x, y, bobber.x, bobber.y) < 0.17) {
      feedbackHit()
      setStage('reel')
      setMessage('咬鉤成功。抓住右側把手往下拉。')
      speak('咬鉤成功，開始控制收線。')
    } else if (stage === 'reel' && distance(x, y, 0.82, 0.34) < 0.18) {
      pullArmedRef.current = true
      setHandleY(y)
      setMessage('保持抓住，慢慢往下拉。')
    }
  }, [bobber, stage])

  const moveInput = useCallback((x: number, y: number, pressed: boolean) => {
    if (!pressed) return
    if (stage === 'cast' && draggingBobber) {
      setBobber({ x: Math.min(0.9, Math.max(0.1, x)), y: Math.min(0.78, Math.max(0.2, y)) })
    } else if (stage === 'reel' && pullArmedRef.current) {
      setHandleY(Math.min(0.76, Math.max(0.3, y)))
      if (y >= 0.68) setMessage('很好，現在放開把手。')
    }
  }, [draggingBobber, stage])

  const releaseInput = useCallback((x: number, y: number) => {
    if (stage === 'cast' && draggingBobber) {
      const spot = FISHING_SPOTS.find(candidate => distance(x, y, candidate.x, candidate.y) < 0.17)
      if (spot) {
        setSelectedSpot(spot)
        setBobber({ x: spot.x, y: spot.y })
        setStage('wait')
        setMessage(`已拋到${spot.label}，觀察浮標。`)
        feedbackHit()
        speak(`拋竿成功，現在觀察${spot.label}的浮標。`)
      } else {
        setBobber({ x: 0.82, y: 0.76 })
        setMessage('差一點，選一個發光釣點再試一次。')
      }
      setDraggingBobber(false)
    } else if (stage === 'reel' && pullArmedRef.current) {
      if (handleY >= 0.65 || y >= 0.65) {
        const nextCount = pullCount + 1
        feedbackHit()
        setPullCount(nextCount)
        if (nextCount >= 3) finishCatch()
        else setMessage(`完成第 ${nextCount} 次。把手回到上方，還要 ${3 - nextCount} 次。`)
      } else {
        setMessage('不用急，從上方抓住後拉到下方即可。')
      }
      pullArmedRef.current = false
      setHandleY(0.34)
    }
    inputDownRef.current = false
  }, [draggingBobber, finishCatch, handleY, pullCount, stage])

  useEffect(() => {
    if (!handPoint || inputMode !== 'camera') return
    if (handPoint.pinching && !inputDownRef.current) pressInput(handPoint.x, handPoint.y)
    moveInput(handPoint.x, handPoint.y, handPoint.pinching)
    if (!handPoint.pinching && inputDownRef.current) releaseInput(handPoint.x, handPoint.y)
  }, [handPoint, inputMode, moveInput, pressInput, releaseInput])

  useEffect(() => {
    if (stage !== 'complete' || savedRef.current) return
    savedRef.current = true
    const durationSecs = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
    fetch('/api/game/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_type: 'fishing-king',
        difficulty: 'mission-v1',
        score: 100,
        hits: 1,
        misses: 0,
        accuracy: 100,
        duration_secs: durationSecs,
      }),
    }).catch(() => {})
  }, [stage])

  const pointerPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  const completedSteps = stage === 'cast' ? 0 : stage === 'wait' || stage === 'bite' ? 1 : stage === 'reel' ? 2 : 3
  const currentCopy = stage === 'complete' ? null : STAGE_COPY[stage]

  if (stage === 'complete') {
    return (
      <main className="min-h-screen bg-[#e7f5f4] px-4 py-8 text-slate-900">
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-xl flex-col items-center justify-center rounded-[34px] border-4 border-[#123f52] bg-[#fffdf5] p-6 text-center shadow-[0_24px_70px_rgba(14,65,84,0.2)]">
          <div className="relative mb-4 grid h-32 w-32 place-items-center rounded-full bg-[#a8dadc] text-8xl shadow-inner"><span className="animate-[fishBob_1.8s_ease-in-out_infinite]">{selectedSpot?.fish ?? '🐟'}</span></div>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-[#d56b3f]">今日漁獲</p>
          <h1 className="mt-2 font-serif text-4xl font-black text-[#123f52]">釣到{selectedSpot?.fishName ?? '銀光魚'}</h1>
          <p className="mt-3 max-w-md text-lg font-semibold text-slate-600">你完成了選點拋竿、觀察咬鉤和三次控制收線，不需要刷分或搶速度。</p>
          <div className="mt-6 grid w-full grid-cols-3 gap-2">
            {['選點拋竿', '觀察咬鉤', '控制收線'].map((label, index) => <div key={label} className="rounded-2xl bg-[#e8f3e8] px-2 py-4 text-sm font-black text-[#123f52]"><span className="block text-2xl">✓</span>{index + 1}. {label}</div>)}
          </div>
          <div className="mt-7 flex w-full gap-3">
            <button type="button" onClick={() => router.push('/')} className="min-h-12 flex-1 rounded-2xl border-2 border-slate-300 bg-white px-3 font-black text-slate-700">回首頁</button>
            <button type="button" onClick={onExit} className="min-h-12 flex-[1.4] rounded-2xl bg-[#d56b3f] px-3 font-black text-white shadow-lg">換個釣點</button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(#ccecf0_0,#e8f2d3_45%,#c29a6b_100%)] px-3 py-4 text-slate-900 sm:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-3 flex items-center justify-between gap-3">
          <button type="button" onClick={onExit} className="min-h-11 rounded-full border-2 border-slate-300 bg-white/90 px-4 font-black text-slate-700">← 離開</button>
          <div className="text-right"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#b84e2c]">晨光湖任務</p><p className="font-serif text-xl font-black text-[#123f52]">復能釣魚王</p></div>
        </header>

        <section className="mb-3 rounded-[24px] border-2 border-white/80 bg-white/88 p-4 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-black tracking-[0.16em] text-[#d56b3f]">{currentCopy?.eyebrow}</p><h1 className="mt-1 font-serif text-2xl font-black text-[#123f52] sm:text-3xl">{currentCopy?.title}</h1></div>
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#f4d35e] text-3xl" aria-hidden>{stage === 'cast' ? '🎯' : stage === 'wait' || stage === 'bite' ? '👀' : '🎣'}</div>
          </div>
          <p className="mt-2 font-semibold text-slate-600">{currentCopy?.instruction}</p>
          <div className="mt-3 grid grid-cols-3 gap-2" aria-label={`已完成 ${completedSteps} 個步驟`}>
            {['拋竿', '咬鉤', '收線'].map((label, index) => <div key={label} className={`h-2 rounded-full ${index < completedSteps ? 'bg-[#123f52]' : index === completedSteps ? 'bg-[#f4a261]' : 'bg-slate-200'}`}><span className="sr-only">{label}</span></div>)}
          </div>
        </section>

        <div
          ref={boardRef}
          data-testid="fishing-board"
          className="relative h-[min(61vh,570px)] min-h-[430px] w-full select-none overflow-hidden rounded-[32px] border-[6px] border-[#284b63] bg-[#64b5c4] shadow-[0_24px_60px_rgba(18,63,82,0.3)]"
          style={{ touchAction: 'none' }}
          onPointerDown={event => {
            if (inputMode !== 'pointer') return
            event.currentTarget.setPointerCapture(event.pointerId)
            const point = pointerPosition(event)
            pressInput(point.x, point.y)
          }}
          onPointerMove={event => {
            if (inputMode !== 'pointer' || !inputDownRef.current) return
            const point = pointerPosition(event)
            moveInput(point.x, point.y, true)
          }}
          onPointerUp={event => {
            if (inputMode !== 'pointer') return
            const point = pointerPosition(event)
            releaseInput(point.x, point.y)
          }}
          onPointerCancel={event => {
            if (inputMode !== 'pointer') return
            const point = pointerPosition(event)
            releaseInput(point.x, point.y)
          }}
        >
          {video}
          <div className="absolute inset-x-0 top-0 h-[18%] bg-[linear-gradient(#8ed3df,#bfe7e5)]" />
          <div className="absolute inset-x-0 bottom-0 h-[82%] bg-[radial-gradient(ellipse_at_50%_0,#66bdc8,#24758e_62%,#164d63)]" />
          <div className="absolute inset-x-0 top-[16%] h-4 bg-white/35 blur-[2px]" />
          <div className="absolute -left-8 bottom-[-5%] h-[28%] w-[42%] rotate-6 rounded-[50%] bg-[#739e57]" />
          <div className="absolute -right-10 bottom-[-8%] h-[30%] w-[38%] -rotate-6 rounded-[50%] bg-[#9c774b]" />

          {stage === 'cast' && FISHING_SPOTS.map(spot => (
            <div key={spot.id} data-testid={`spot-${spot.id}`} className="absolute z-10 grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-dashed border-[#fff4a8] bg-white/15 text-center text-white shadow-[0_0_24px_rgba(255,244,168,0.55)]" style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}>
              <span className="text-xs font-black">{spot.label}</span><span className="text-[10px] font-bold opacity-80">{spot.hint}</span>
            </div>
          ))}

          {stage === 'reel' && (
            <>
              <div className="absolute right-[5%] top-[22%] h-[60%] w-[22%] rounded-[28px] border-4 border-[#123f52] bg-[#f8e4b7]/95 shadow-2xl">
                <p className="pt-3 text-center text-xs font-black text-[#123f52]">收線 {pullCount} / 3</p>
                <div className="absolute left-1/2 top-[24%] h-[58%] w-3 -translate-x-1/2 rounded-full bg-[#123f52]/20" />
                <div className="absolute left-1/2 top-[24%] h-[58%] w-3 -translate-x-1/2 overflow-hidden rounded-full"><div className="absolute inset-x-0 bottom-0 bg-[#d56b3f]" style={{ height: `${(pullCount / 3) * 100}%` }} /></div>
              </div>
              <div data-testid="reel-handle" className="absolute z-20 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[7px] border-[#123f52] bg-[#f4d35e] text-4xl shadow-xl" style={{ left: '82%', top: `${handleY * 100}%` }}>🖐️</div>
              <div className="absolute right-[7%] top-[68%] rounded-full bg-white/85 px-3 py-1 text-xs font-black text-[#123f52]">拉到這裡再放開</div>
            </>
          )}

          {stage !== 'reel' && (
            <div data-testid="bobber" className={`absolute z-20 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[filter,transform] ${stage === 'bite' ? 'animate-bounce bg-[#f4d35e]/35 shadow-[0_0_32px_rgba(244,211,94,0.9)]' : ''}`} style={{ left: `${bobber.x * 100}%`, top: `${bobber.y * 100}%` }}>
              <div className="absolute left-1/2 top-1/2 h-16 w-4 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-2 border-white bg-white shadow-lg"><div className="h-1/2 bg-[#e63946]" /></div>
              <div className="absolute left-1/2 top-[62%] h-3 w-16 -translate-x-1/2 rounded-[50%] border-2 border-white/50" />
            </div>
          )}

          {selectedSpot && stage !== 'cast' && <div className="absolute left-5 top-[23%] rounded-2xl bg-[#123f52]/80 px-3 py-2 text-sm font-black text-white">{selectedSpot.label} · {selectedSpot.hint}</div>}

          {inputMode === 'camera' && handPoint?.detected && <div className={`pointer-events-none absolute z-40 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 ${handPoint.pinching ? 'border-[#f4d35e] bg-[#f4d35e]/40' : 'border-white bg-white/20'}`} style={{ left: `${handPoint.x * 100}%`, top: `${handPoint.y * 100}%` }} />}

          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 rounded-2xl bg-[#102f3c]/92 px-4 py-3 text-center text-sm font-black text-white shadow-lg" aria-live="polite">{message}</div>
        </div>

        <div className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-white/85 px-4 py-3 text-sm font-bold text-slate-600">
          <span>{inputMode === 'camera' ? '捏合＝抓住，張開＝放開' : '滑鼠拖曳或手指按住操作'}</span>
          {inputStatus && <span className="text-right text-[#b84e2c]">{inputStatus}</span>}
        </div>
      </div>
      <style>{`@keyframes fishBob { 0%,100%{ transform:translateY(0) rotate(-5deg) } 50%{ transform:translateY(-8px) rotate(5deg) } }`}</style>
    </main>
  )
}

export default function FishingKingPage() {
  const router = useRouter()
  const [mode, setMode] = useState<InputMode | null>(null)

  if (mode === 'camera') return <CameraFishing onExit={() => setMode(null)} />
  if (mode === 'pointer') return <FishingMission inputMode="pointer" onExit={() => setMode(null)} />

  return (
    <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(#bde7ea_0,#eaf3d3_50%,#bc8758)] px-4 py-7 text-slate-900">
      <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-[36px] border-4 border-[#123f52] bg-[#fffdf5] shadow-[0_30px_90px_rgba(18,63,82,0.3)]">
        <div className="relative bg-[#123f52] px-6 py-8 text-white sm:px-10">
          <button type="button" onClick={() => router.push('/')} className="absolute left-4 top-4 min-h-11 rounded-full border border-white/30 bg-white/10 px-4 font-black">← 首頁</button>
          <div className="pt-12 text-center sm:pt-4">
            <div className="text-7xl" aria-hidden>🎣</div>
            <p className="mt-3 text-xs font-black uppercase tracking-[0.24em] text-[#f4d35e]">晨光湖完整釣魚關卡</p>
            <h1 className="mt-2 font-serif text-4xl font-black sm:text-5xl">復能釣魚王</h1>
            <p className="mx-auto mt-3 max-w-xl text-lg font-semibold text-[#d9f0ef]">不是伸手碰魚。自己選釣點、觀察浮標，再控制三次收線把魚釣上來。</p>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { n: '01', icon: '🎯', title: '選點拋竿', detail: '三個釣點，會遇到不同魚' },
              { n: '02', icon: '👀', title: '觀察咬鉤', detail: '浮標下沉後再準備收線' },
              { n: '03', icon: '🎣', title: '控制收線', detail: '抓住把手，向下拉三次' },
            ].map(item => <article key={item.n} className="rounded-[22px] border-2 border-[#c8dedc] bg-[#eff9f6] p-4"><div className="flex items-center justify-between"><span className="font-serif text-3xl font-black text-[#d56b3f]">{item.n}</span><span className="text-3xl" aria-hidden>{item.icon}</span></div><h2 className="mt-3 text-lg font-black text-[#123f52]">{item.title}</h2><p className="mt-1 text-sm font-semibold text-slate-600">{item.detail}</p></article>)}
          </div>

          <div className="mt-6 rounded-2xl bg-[#e8f3e8] px-4 py-3 text-center font-bold text-[#123f52]">釣起一尾魚即可過關，不計時、不漏魚，也不要求高分。</div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button type="button" data-testid="start-camera" onClick={() => setMode('camera')} className="min-h-16 rounded-2xl bg-[#d56b3f] px-5 text-lg font-black text-white shadow-lg transition-transform active:scale-[0.98]">用鏡頭手勢開始</button>
            <button type="button" data-testid="start-pointer" onClick={() => setMode('pointer')} className="min-h-16 rounded-2xl border-2 border-[#123f52] bg-white px-5 text-lg font-black text-[#123f52] transition-transform active:scale-[0.98]">用觸控／滑鼠體驗</button>
          </div>
          <p className="mt-3 text-center text-xs font-semibold text-slate-500">鏡頭模式：食指與拇指捏合操作。觸控模式可供手機或無鏡頭裝置使用。</p>
        </div>
      </section>
    </main>
  )
}
