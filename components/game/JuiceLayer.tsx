'use client'

// Game Juice 共用特效層：命中粒子、分數彈跳字、螢幕微震。
// 精緻感的核心是「回饋感」——所有遊戲共用這一層，之後遊戲工廠量產的新遊戲直接吃到。
//
// 用法：
//   const juiceRef = useRef<JuiceHandle>(null)
//   <JuiceLayer ref={juiceRef} />   // 放在遊戲畫面容器（relative）內、目標物之上
//   juiceRef.current?.burst(nx, ny)                     // 命中粒子
//   juiceRef.current?.floatText(nx, ny, '+10')          // 彈跳分數字
//   juiceRef.current?.shake()                           // 螢幕微震（幅度小、適老）
//
// 適老設計：無閃爍（粒子平滑淡出）、震動幅度 ≤6px 且 <0.3s。

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

export interface BurstOpts {
  colors?: string[]     // 粒子顏色
  count?: number        // 粒子數（預設 14）
  emojis?: string[]     // 混入的 emoji 碎片（如 ['✨']）
}
export interface FloatTextOpts {
  color?: string        // 文字顏色（預設金黃）
  size?: number         // 字級 px（預設 34）
}
export interface JuiceHandle {
  burst(nx: number, ny: number, opts?: BurstOpts): void
  floatText(nx: number, ny: number, text: string, opts?: FloatTextOpts): void
  shake(intensity?: number): void   // 0–1，預設 0.6
}

interface Particle {
  x: number; y: number; vx: number; vy: number
  r: number; color: string; emoji?: string
  born: number; life: number
}
interface FloatItem {
  x: number; y: number; text: string; color: string; size: number
  born: number; life: number
}

const DEFAULT_COLORS = ['#FFD600', '#FF9800', '#8BC34A', '#4FC3F7', '#F48FB1']

const JuiceLayer = forwardRef<JuiceHandle, { className?: string }>(function JuiceLayer({ className }, ref) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const particles  = useRef<Particle[]>([])
  const floats     = useRef<FloatItem[]>([])
  const rafRef     = useRef<number | null>(null)
  const runningRef = useRef(false)

  function ensureLoop() {
    if (runningRef.current) return
    runningRef.current = true
    const step = () => {
      const canvas = canvasRef.current
      if (!canvas) { runningRef.current = false; return }
      const parent = canvas.parentElement
      const W = parent?.clientWidth ?? canvas.clientWidth
      const H = parent?.clientHeight ?? canvas.clientHeight
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H }
      const ctx = canvas.getContext('2d')
      if (!ctx) { runningRef.current = false; return }
      ctx.clearRect(0, 0, W, H)
      const now = performance.now()

      // 粒子：重力 + 阻力 + 淡出
      particles.current = particles.current.filter(p => now - p.born < p.life)
      for (const p of particles.current) {
        const age = (now - p.born) / p.life
        p.vy += 0.35
        p.vx *= 0.96; p.vy *= 0.985
        p.x += p.vx; p.y += p.vy
        ctx.globalAlpha = 1 - age * age
        if (p.emoji) {
          ctx.font = `${p.r * 2.4}px serif`
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText(p.emoji, p.x, p.y)
        } else {
          ctx.fillStyle = p.color
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - age * 0.5), 0, Math.PI * 2); ctx.fill()
        }
      }

      // 彈跳字：先放大後上飄淡出
      floats.current = floats.current.filter(f => now - f.born < f.life)
      for (const f of floats.current) {
        const age = (now - f.born) / f.life
        const scale = age < 0.18 ? 0.6 + (age / 0.18) * 0.55 : 1.15 - (age - 0.18) * 0.15
        const dy = age < 0.18 ? 0 : (age - 0.18) * 70
        ctx.globalAlpha = age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3
        ctx.font = `900 ${f.size * scale}px system-ui, sans-serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.55)'
        ctx.strokeText(f.text, f.x, f.y - dy)
        ctx.fillStyle = f.color
        ctx.fillText(f.text, f.x, f.y - dy)
      }
      ctx.globalAlpha = 1

      if (particles.current.length || floats.current.length) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        ctx.clearRect(0, 0, W, H)
        runningRef.current = false
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }

  useImperativeHandle(ref, () => ({
    burst(nx, ny, opts) {
      const canvas = canvasRef.current
      if (!canvas) return
      const W = canvas.parentElement?.clientWidth ?? 640
      const H = canvas.parentElement?.clientHeight ?? 480
      const colors = opts?.colors ?? DEFAULT_COLORS
      const emojis = opts?.emojis ?? ['✨']
      const count = opts?.count ?? 14
      const now = performance.now()
      for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + Math.random() * 0.6
        const spd = 3 + Math.random() * 5
        const isEmoji = i % 5 === 4
        particles.current.push({
          x: nx * W, y: ny * H,
          vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 2.5,
          r: 3.5 + Math.random() * 4,
          color: colors[i % colors.length],
          emoji: isEmoji ? emojis[i % emojis.length] : undefined,
          born: now, life: 550 + Math.random() * 350,
        })
      }
      ensureLoop()
    },
    floatText(nx, ny, text, opts) {
      const canvas = canvasRef.current
      if (!canvas) return
      const W = canvas.parentElement?.clientWidth ?? 640
      const H = canvas.parentElement?.clientHeight ?? 480
      floats.current.push({
        x: nx * W, y: ny * H, text,
        color: opts?.color ?? '#FFD600',
        size: opts?.size ?? 34,
        born: performance.now(), life: 900,
      })
      ensureLoop()
    },
    shake(intensity = 0.6) {
      const el = canvasRef.current?.parentElement
      if (!el || !el.animate) return
      const a = Math.min(6, 8 * intensity)  // 幅度上限 6px（適老）
      el.animate([
        { transform: 'translate(0,0)' },
        { transform: `translate(${a}px,${-a * 0.6}px)` },
        { transform: `translate(${-a * 0.8}px,${a * 0.5}px)` },
        { transform: `translate(${a * 0.5}px,${a * 0.3}px)` },
        { transform: 'translate(0,0)' },
      ], { duration: 260, easing: 'ease-out' })
    },
  }), [])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none z-20 ${className ?? ''}`}
    />
  )
})

export default JuiceLayer
