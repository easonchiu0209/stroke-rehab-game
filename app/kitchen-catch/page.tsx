'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCamera } from '@/hooks/useCamera'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { PinchPointer, usePinchPointer } from '@/hooks/usePinchPointer'
import { feedbackHit, speak } from '@/lib/feedback'

type InputMode = 'camera' | 'pointer'
type MissionStep = 'ingredients' | 'steady' | 'stir' | 'complete'

interface Ingredient {
  id: 'tomato' | 'egg' | 'scallion'
  emoji: string
  name: string
  x: number
  y: number
}

const INGREDIENTS: Ingredient[] = [
  { id: 'tomato', emoji: '🍅', name: '番茄', x: 0.2, y: 0.29 },
  { id: 'egg', emoji: '🥚', name: '雞蛋', x: 0.5, y: 0.23 },
  { id: 'scallion', emoji: '🌿', name: '青蔥', x: 0.8, y: 0.29 },
]

const STEP_COPY: Record<Exclude<MissionStep, 'complete'>, { eyebrow: string; title: string; instruction: string }> = {
  ingredients: {
    eyebrow: '步驟 1 / 3 · 備料',
    title: '依序把食材放進碗裡',
    instruction: '捏住目前亮起的食材，搬到碗裡再放開。',
  },
  steady: {
    eyebrow: '步驟 2 / 3 · 穩定',
    title: '穩穩按住鍋柄',
    instruction: '按住發光區域 1.5 秒；中途放開也能重新開始。',
  },
  stir: {
    eyebrow: '步驟 3 / 3 · 攪拌',
    title: '沿著鍋緣畫三圈',
    instruction: '按住並繞著鍋子畫圈，不限速度，也不會倒扣。',
  },
}

function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by)
}

function CameraMission({ onExit }: { onExit: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { landmarker, isLoading, error: modelError } = useHandLandmarker()
  const { isReady, error: cameraError, isMirrored, startCamera, stopCamera } = useCamera(videoRef)
  const handPoint = usePinchPointer({ landmarker, videoRef, isActive: isReady && !!landmarker, isMirrored })

  useEffect(() => {
    startCamera('user')
    return () => stopCamera()
  }, [startCamera, stopCamera])

  return (
    <MissionBoard
      inputMode="camera"
      handPoint={handPoint}
      inputStatus={cameraError?.message ?? modelError ?? (isLoading || !isReady ? '正在準備鏡頭與手部辨識…' : null)}
      video={<video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover opacity-[0.12]" style={{ transform: isMirrored ? 'scaleX(-1)' : undefined }} />}
      onExit={onExit}
    />
  )
}

function MissionBoard({
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
  const [step, setStep] = useState<MissionStep>('ingredients')
  const [ingredientIndex, setIngredientIndex] = useState(0)
  const [positions, setPositions] = useState(() => INGREDIENTS.map(({ x, y }) => ({ x, y })))
  const [grabbedIndex, setGrabbedIndex] = useState<number | null>(null)
  const [holding, setHolding] = useState(false)
  const [steadyProgress, setSteadyProgress] = useState(0)
  const [stirProgress, setStirProgress] = useState(0)
  const [message, setMessage] = useState('先從番茄開始。')
  const inputDownRef = useRef(false)
  const steadyStartedRef = useRef<number | null>(null)
  const lastStirAngleRef = useRef<number | null>(null)
  const stirDistanceRef = useRef(0)
  const startedAtRef = useRef(Date.now())
  const savedRef = useRef(false)

  const finishStep = useCallback((nextStep: MissionStep) => {
    feedbackHit()
    setStep(nextStep)
    setHolding(false)
    inputDownRef.current = false
    steadyStartedRef.current = null
    lastStirAngleRef.current = null
    if (nextStep === 'steady') {
      setMessage('食材到齊，接著穩住鍋柄。')
      speak('食材到齊，接著穩住鍋柄。')
    } else if (nextStep === 'stir') {
      setMessage('很好，現在沿著鍋緣畫三圈。')
      speak('很好，現在沿著鍋緣畫三圈。')
    } else {
      setMessage('料理完成！三種動作都完成了。')
      speak('料理完成！三種動作都完成了。')
    }
  }, [])

  const releaseInput = useCallback((x: number, y: number) => {
    if (step === 'ingredients' && grabbedIndex !== null) {
      const droppedInBowl = distance(x, y, 0.5, 0.73) < 0.18
      if (droppedInBowl) {
        const nextIndex = ingredientIndex + 1
        feedbackHit()
        setIngredientIndex(nextIndex)
        setMessage(nextIndex < INGREDIENTS.length ? `接著放入${INGREDIENTS[nextIndex].name}。` : '三樣食材都放好了。')
        if (nextIndex >= INGREDIENTS.length) finishStep('steady')
      } else {
        setPositions(previous => previous.map((position, index) => index === grabbedIndex
          ? { x: INGREDIENTS[index].x, y: INGREDIENTS[index].y }
          : position))
        setMessage('沒關係，把食材放進碗裡即可。')
      }
      setGrabbedIndex(null)
    }
    inputDownRef.current = false
    setHolding(false)
    steadyStartedRef.current = null
    lastStirAngleRef.current = null
    if (step === 'steady') setSteadyProgress(0)
  }, [finishStep, grabbedIndex, ingredientIndex, step])

  const moveInput = useCallback((x: number, y: number, pressed: boolean) => {
    if (!pressed) return
    if (step === 'ingredients' && grabbedIndex !== null) {
      setPositions(previous => previous.map((position, index) => index === grabbedIndex ? { x, y } : position))
      return
    }
    if (step === 'stir' && holding) {
      const radius = distance(x, y, 0.5, 0.58)
      if (radius < 0.13 || radius > 0.38) {
        lastStirAngleRef.current = null
        return
      }
      const angle = Math.atan2(y - 0.58, x - 0.5)
      const previous = lastStirAngleRef.current
      lastStirAngleRef.current = angle
      if (previous === null) return
      let delta = angle - previous
      if (delta > Math.PI) delta -= Math.PI * 2
      if (delta < -Math.PI) delta += Math.PI * 2
      if (Math.abs(delta) > 0.7) return
      stirDistanceRef.current += Math.abs(delta)
      const progress = Math.min(1, stirDistanceRef.current / (Math.PI * 2 * 3))
      setStirProgress(progress)
      if (progress >= 1) finishStep('complete')
    }
  }, [finishStep, grabbedIndex, holding, step])

  const pressInput = useCallback((x: number, y: number) => {
    inputDownRef.current = true
    if (step === 'ingredients') {
      const target = positions[ingredientIndex]
      if (target && distance(x, y, target.x, target.y) < 0.14) {
        setGrabbedIndex(ingredientIndex)
        setMessage(`抓到${INGREDIENTS[ingredientIndex].name}，搬到碗裡。`)
      }
    } else if (step === 'steady' && distance(x, y, 0.71, 0.64) < 0.2) {
      steadyStartedRef.current = performance.now()
      setHolding(true)
      setMessage('保持住，進度會自己累積。')
    } else if (step === 'stir' && distance(x, y, 0.5, 0.58) < 0.38) {
      setHolding(true)
      lastStirAngleRef.current = Math.atan2(y - 0.58, x - 0.5)
      setMessage('沿著圓環繼續畫圈。')
    }
  }, [ingredientIndex, positions, step])

  useEffect(() => {
    if (step !== 'steady' || !holding) return
    const timer = window.setInterval(() => {
      if (steadyStartedRef.current === null) return
      const progress = Math.min(1, (performance.now() - steadyStartedRef.current) / 1500)
      setSteadyProgress(progress)
      if (progress >= 1) {
        window.clearInterval(timer)
        finishStep('stir')
      }
    }, 50)
    return () => window.clearInterval(timer)
  }, [finishStep, holding, step])

  useEffect(() => {
    if (!handPoint || inputMode !== 'camera') return
    if (handPoint.pinching && !inputDownRef.current) pressInput(handPoint.x, handPoint.y)
    moveInput(handPoint.x, handPoint.y, handPoint.pinching)
    if (!handPoint.pinching && inputDownRef.current) releaseInput(handPoint.x, handPoint.y)
  }, [handPoint, inputMode, moveInput, pressInput, releaseInput])

  useEffect(() => {
    if (step !== 'complete' || savedRef.current) return
    savedRef.current = true
    const durationSecs = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
    fetch('/api/game/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_type: 'kitchen-catch',
        difficulty: 'mission-v1',
        score: 100,
        hits: 3,
        misses: 0,
        accuracy: 100,
        duration_secs: durationSecs,
      }),
    }).catch(() => {})
  }, [step])

  const pointerPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  const completedSteps = step === 'ingredients' ? 0 : step === 'steady' ? 1 : step === 'stir' ? 2 : 3
  const currentCopy = step === 'complete' ? null : STEP_COPY[step]

  if (step === 'complete') {
    return (
      <main className="min-h-screen bg-[#fff7e8] px-4 py-8 text-stone-900">
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-xl flex-col items-center justify-center rounded-[32px] border-4 border-[#2f5d50] bg-[#fffdf7] p-6 text-center shadow-[0_24px_70px_rgba(83,55,25,0.18)]">
          <div className="mb-4 grid h-28 w-28 place-items-center rounded-full bg-[#f4c95d] text-7xl shadow-inner" aria-hidden>🍳</div>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-[#b44b2a]">今日料理完成</p>
          <h1 className="mt-2 font-serif text-4xl font-black text-[#2f5d50]">番茄蛋上桌</h1>
          <p className="mt-3 max-w-md text-lg font-semibold text-stone-600">你完成了抓取搬運、穩定保持和畫圈攪拌，不需要追分或拼速度。</p>
          <div className="mt-6 grid w-full grid-cols-3 gap-2" aria-label="完成的動作">
            {['抓取搬運', '穩定保持', '畫圈攪拌'].map((label, index) => (
              <div key={label} className="rounded-2xl bg-[#eef5df] px-2 py-4 text-sm font-black text-[#2f5d50]"><span className="block text-2xl">✓</span>{index + 1}. {label}</div>
            ))}
          </div>
          <div className="mt-7 flex w-full gap-3">
            <button type="button" onClick={() => router.push('/')} className="min-h-12 flex-1 rounded-2xl border-2 border-stone-300 bg-white px-3 font-black text-stone-700">回首頁</button>
            <button type="button" onClick={onExit} className="min-h-12 flex-[1.4] rounded-2xl bg-[#b44b2a] px-3 font-black text-white shadow-lg">再做一道</button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#fff9dc_0,#f7e5c3_45%,#d9b98b_100%)] px-3 py-4 text-stone-900 sm:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-3 flex items-center justify-between gap-3">
          <button type="button" onClick={onExit} className="min-h-11 rounded-full border-2 border-stone-300 bg-white/90 px-4 font-black text-stone-700">← 離開</button>
          <div className="text-right">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8e3b22]">番茄蛋任務</p>
            <p className="font-serif text-xl font-black text-[#2f5d50]">小鎮料理所</p>
          </div>
        </header>

        <section className="mb-3 rounded-[24px] border-2 border-white/80 bg-white/85 p-4 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-[0.16em] text-[#b44b2a]">{currentCopy?.eyebrow}</p>
              <h1 className="mt-1 font-serif text-2xl font-black text-[#2f5d50] sm:text-3xl">{currentCopy?.title}</h1>
            </div>
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#f4c95d] text-3xl" aria-hidden>{step === 'ingredients' ? '🥣' : step === 'steady' ? '🍳' : '🥄'}</div>
          </div>
          <p className="mt-2 font-semibold text-stone-600">{currentCopy?.instruction}</p>
          <div className="mt-3 grid grid-cols-3 gap-2" aria-label={`已完成 ${completedSteps} 個步驟`}>
            {['備料', '穩定', '攪拌'].map((label, index) => (
              <div key={label} className={`h-2 rounded-full ${index < completedSteps ? 'bg-[#2f5d50]' : index === completedSteps ? 'bg-[#f4a261]' : 'bg-stone-200'}`}><span className="sr-only">{label}</span></div>
            ))}
          </div>
        </section>

        <div
          ref={boardRef}
          data-testid="kitchen-board"
          className="relative h-[min(61vh,570px)] min-h-[430px] w-full select-none overflow-hidden rounded-[30px] border-[6px] border-[#6f4e37] bg-[#f8d9a0] shadow-[0_24px_60px_rgba(82,52,24,0.3)]"
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
          <div className="absolute inset-x-0 top-0 h-[18%] bg-[#fff2cc]" />
          <div className="absolute left-[8%] top-[4%] h-[11%] w-[18%] rounded-t-full border-4 border-[#6f4e37] bg-[#9cc5a1]" />
          <div className="absolute right-[8%] top-[5%] h-[9%] w-[24%] rounded-lg border-4 border-[#6f4e37] bg-[#fefae0]" />
          <div className="absolute inset-x-0 bottom-0 h-[34%] bg-[linear-gradient(90deg,#b97844_0_7%,#c78952_7%_14%)] bg-[length:90px_100%]" />

          {step === 'ingredients' && INGREDIENTS.map((ingredient, index) => {
            if (index < ingredientIndex) return null
            const active = index === ingredientIndex
            const position = positions[index]
            return (
              <div
                key={ingredient.id}
                data-testid={`ingredient-${ingredient.id}`}
                className={`absolute grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-6xl transition-[filter,transform] ${active ? 'z-20 bg-white/70 drop-shadow-xl' : 'z-10 grayscale-[0.75] opacity-60'}`}
                style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`, boxShadow: active ? '0 0 0 7px rgba(244,201,93,0.8)' : undefined }}
                aria-label={`${ingredient.name}${active ? '，目前要放入的食材' : '，稍後使用'}`}
              >{ingredient.emoji}</div>
            )
          })}

          {step === 'ingredients' && (
            <div data-testid="mixing-bowl" className="absolute left-1/2 top-[73%] z-10 h-[28%] w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-b-[55%] border-[7px] border-[#2f5d50] border-t-[14px] bg-[#eef5df] shadow-2xl">
              <div className="absolute inset-x-[12%] top-[18%] flex justify-center gap-1 text-4xl" aria-hidden>{INGREDIENTS.slice(0, ingredientIndex).map(item => <span key={item.id}>{item.emoji}</span>)}</div>
              <p className="absolute inset-x-0 bottom-4 text-center text-sm font-black text-[#2f5d50]">放進這裡</p>
            </div>
          )}

          {step === 'steady' && (
            <>
              <div className="absolute left-1/2 top-[58%] h-[46%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[10px] border-[#313638] bg-[radial-gradient(circle,#f4c95d_0_35%,#cb793a_36%_55%,#313638_56%)] shadow-2xl" />
              <div data-testid="steady-handle" className="absolute left-[70%] top-[64%] z-20 h-[18%] w-[31%] -translate-y-1/2 rounded-r-full border-[8px] border-[#313638] bg-[#5f6b66]" style={{ boxShadow: holding ? '0 0 0 12px rgba(244,201,93,0.7)' : '0 0 0 5px rgba(255,255,255,0.6)' }}>
                <div className="absolute inset-2 overflow-hidden rounded-full bg-black/20"><div className="h-full bg-[#f4c95d] transition-[width]" style={{ width: `${steadyProgress * 100}%` }} /></div>
              </div>
            </>
          )}

          {step === 'stir' && (
            <>
              <div data-testid="stir-ring" className="absolute left-1/2 top-[58%] h-[58%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[10px] border-dashed border-[#fff7d6] bg-[radial-gradient(circle,#f4c95d_0_38%,#db6f3d_39%_62%,#313638_63%)] shadow-2xl" />
              <div className="absolute left-1/2 top-[58%] z-10 grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-center font-black text-[#8e3b22] shadow-lg">
                <span className="text-3xl">{Math.min(3, Math.floor(stirProgress * 3) + 1)}</span>
                <span className="text-xs">/ 3 圈</span>
              </div>
              <div className="absolute inset-x-[15%] bottom-[5%] h-3 overflow-hidden rounded-full bg-black/20"><div className="h-full rounded-full bg-[#f4c95d]" style={{ width: `${stirProgress * 100}%` }} /></div>
            </>
          )}

          {inputMode === 'camera' && handPoint?.detected && (
            <div className={`pointer-events-none absolute z-40 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 ${handPoint.pinching ? 'border-[#f4c95d] bg-[#f4c95d]/40' : 'border-white bg-white/20'}`} style={{ left: `${handPoint.x * 100}%`, top: `${handPoint.y * 100}%` }} />
          )}

          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 rounded-2xl bg-[#243b35]/92 px-4 py-3 text-center text-sm font-black text-white shadow-lg" aria-live="polite">{message}</div>
        </div>

        <div className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-white/85 px-4 py-3 text-sm font-bold text-stone-600">
          <span>{inputMode === 'camera' ? '捏合＝按住，張開＝放開' : '滑鼠拖曳或手指按住操作'}</span>
          {inputStatus && <span className="text-right text-[#a14224]">{inputStatus}</span>}
        </div>
      </div>
    </main>
  )
}

export default function KitchenCatchPage() {
  const router = useRouter()
  const [mode, setMode] = useState<InputMode | null>(null)

  if (mode === 'camera') return <CameraMission onExit={() => setMode(null)} />
  if (mode === 'pointer') return <MissionBoard inputMode="pointer" onExit={() => setMode(null)} />

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_30%_0,#fff8d8,#f2d2a1_48%,#bd8157)] px-4 py-7 text-stone-900">
      <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-[36px] border-4 border-[#2f5d50] bg-[#fffdf7] shadow-[0_30px_90px_rgba(67,45,25,0.3)]">
        <div className="relative bg-[#2f5d50] px-6 py-8 text-white sm:px-10">
          <button type="button" onClick={() => router.push('/')} className="absolute left-4 top-4 min-h-11 rounded-full border border-white/30 bg-white/10 px-4 font-black">← 首頁</button>
          <div className="pt-12 text-center sm:pt-4">
            <div className="text-7xl" aria-hidden>🍳</div>
            <p className="mt-3 text-xs font-black uppercase tracking-[0.24em] text-[#f4c95d]">第一道完整料理關卡</p>
            <h1 className="mt-2 font-serif text-4xl font-black sm:text-5xl">番茄蛋任務</h1>
            <p className="mx-auto mt-3 max-w-xl text-lg font-semibold text-[#e8f0df]">不是揮手碰目標。完成一份料理，要依序抓、放、保持，再畫圈攪拌。</p>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { n: '01', icon: '🥣', title: '抓取搬運', detail: '依序把三樣食材放進碗裡' },
              { n: '02', icon: '🍳', title: '穩定保持', detail: '按住鍋柄，完成穩定進度' },
              { n: '03', icon: '🥄', title: '畫圈攪拌', detail: '沿鍋緣完成三圈，不限速度' },
            ].map(item => (
              <article key={item.n} className="rounded-[22px] border-2 border-[#ead8b8] bg-[#fff8e9] p-4">
                <div className="flex items-center justify-between"><span className="font-serif text-3xl font-black text-[#b44b2a]">{item.n}</span><span className="text-3xl" aria-hidden>{item.icon}</span></div>
                <h2 className="mt-3 text-lg font-black text-[#2f5d50]">{item.title}</h2>
                <p className="mt-1 text-sm font-semibold text-stone-600">{item.detail}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 rounded-2xl bg-[#eef5df] px-4 py-3 text-center font-bold text-[#2f5d50]">完成任務即可過關，不計時、不扣分，也不要求高分。</div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button type="button" data-testid="start-camera" onClick={() => setMode('camera')} className="min-h-16 rounded-2xl bg-[#b44b2a] px-5 text-lg font-black text-white shadow-lg transition-transform active:scale-[0.98]">用鏡頭手勢開始</button>
            <button type="button" data-testid="start-pointer" onClick={() => setMode('pointer')} className="min-h-16 rounded-2xl border-2 border-[#2f5d50] bg-white px-5 text-lg font-black text-[#2f5d50] transition-transform active:scale-[0.98]">用觸控／滑鼠體驗</button>
          </div>
          <p className="mt-3 text-center text-xs font-semibold text-stone-500">鏡頭模式：食指與拇指捏合操作。觸控模式可供手機或無鏡頭裝置使用。</p>
        </div>
      </section>
    </main>
  )
}
