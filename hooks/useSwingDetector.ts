'use client'

// 揮拍偵測：追蹤手腕位置＋速度，羽球飛入擊球區時
// 「靠近＋揮速超過門檻」才算擊中（swing mechanic）。
// 與 useSlashDetector 同族，但目標是單顆拋物線羽球、且命中需要速度。

import { useEffect, useRef, useState } from 'react'
import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { recordTrajectory } from '@/lib/saveSession'
import { getCalib, applyCalib } from '@/lib/calibration'

export interface Shuttle {
  id:          number
  x0:          number    // 起點（normalized display-space）
  y0:          number
  x1:          number    // 落點
  y1:          number
  flightMs:    number    // 全程飛行時間
  arcH:        number    // 拋物線弧高（normalized，往上凸）
  spawnTime:   number    // performance.now()
  hitRadiusPx: number    // 640px 基準寬的命中半徑
  phase:       'in' | 'out'   // in=飛向個案（可擊）、out=飛回對手（純動畫）
}

/** 羽球在 t 時刻的位置（線性插值＋sin 弧） */
export function getShuttlePos(s: Shuttle, now: number) {
  const t = Math.min(1, (now - s.spawnTime) / s.flightMs)
  return {
    t,
    nx: s.x0 + (s.x1 - s.x0) * t,
    ny: s.y0 + (s.y1 - s.y0) * t - s.arcH * Math.sin(Math.PI * t),
  }
}

interface UseSwingDetectorOptions {
  landmarker:  HandLandmarker | null
  videoRef:    React.RefObject<HTMLVideoElement>
  canvasRef:   React.RefObject<HTMLCanvasElement>
  isActive:    boolean
  isMirrored:  boolean
  /** 揮速門檻（normalized units/sec）；低於此速度碰到球也不算擊中 */
  swingThreshold: number
  onHit:    (id: number, info: { speed: number; nx: number; ny: number; reactionMs: number }) => void
  /** 羽球落地（in=個案漏接、out=飛抵對手側） */
  onLanded: (id: number, phase: 'in' | 'out') => void
}

const SPEED_WINDOW_MS = 140   // 揮速取樣窗
const HITTABLE_T      = 0.45  // 飛行進度超過此值才進入擊球區（過網後）

export function useSwingDetector({
  landmarker, videoRef, canvasRef, isActive, isMirrored, swingThreshold, onHit, onLanded,
}: UseSwingDetectorOptions) {
  const [handDetected, setHandDetected] = useState(false)
  const [swingSpeed, setSwingSpeed]     = useState(0)

  const shuttleRef   = useRef<Shuttle | null>(null)
  const doneIdsRef   = useRef(new Set<number>())
  const onHitRef     = useRef(onHit)
  const onLandedRef  = useRef(onLanded)
  const thresholdRef = useRef(swingThreshold)
  onHitRef.current    = onHit
  onLandedRef.current = onLanded
  thresholdRef.current = swingThreshold

  const rafRef        = useRef<number | null>(null)
  const samplesRef    = useRef<{ t: number; x: number; y: number }[]>([])
  const trajRef       = useRef<number[][]>([])
  const trajStartRef  = useRef(-1)
  const lastSampleRef = useRef(-1)

  function setShuttle(s: Shuttle | null) { shuttleRef.current = s }

  useEffect(() => {
    if (!isActive || !landmarker) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const canvas = canvasRef.current
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    doneIdsRef.current.clear()
    samplesRef.current = []
    trajRef.current = []; trajStartRef.current = -1; lastSampleRef.current = -1
    recordTrajectory(trajRef.current)
    const cal = getCalib()

    function drawShuttle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
      // 軟木頭（下）＋ 羽毛錐（上）——手繪，因為沒有羽球 emoji
      ctx.save()
      ctx.translate(cx, cy)
      // 羽毛錐
      ctx.beginPath()
      ctx.moveTo(0, r * 0.15)
      ctx.lineTo(-r * 0.55, -r * 0.9)
      ctx.lineTo(r * 0.55, -r * 0.9)
      ctx.closePath()
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(148,163,184,0.9)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      // 羽毛紋
      ctx.beginPath()
      ctx.moveTo(0, r * 0.1); ctx.lineTo(0, -r * 0.85)
      ctx.moveTo(-r * 0.28, -r * 0.2); ctx.lineTo(-r * 0.45, -r * 0.88)
      ctx.moveTo(r * 0.28, -r * 0.2); ctx.lineTo(r * 0.45, -r * 0.88)
      ctx.stroke()
      // 軟木頭
      ctx.beginPath()
      ctx.arc(0, r * 0.3, r * 0.32, 0, Math.PI * 2)
      ctx.fillStyle = '#fca5a5'
      ctx.fill()
      ctx.strokeStyle = '#ef4444'
      ctx.stroke()
      ctx.restore()
    }

    function loop() {
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width  = video.videoWidth  || 640
        canvas.height = video.videoHeight || 480
      }

      const now = performance.now()
      let results
      try { results = landmarker!.detectForVideo(video, now) } catch {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      const scale = canvas.width / 640

      // ── 羽球：畫圖＋落地判定 ─────────────────────────────
      const shuttle = shuttleRef.current
      let sPos: { t: number; nx: number; ny: number } | null = null
      if (shuttle && !doneIdsRef.current.has(shuttle.id)) {
        sPos = getShuttlePos(shuttle, now)
        if (ctx) {
          // canvas 有 CSS scaleX(-1)，畫在 (1-nx) 讓螢幕呈現 nx
          const cx = (1 - sPos.nx) * canvas.width
          const cy = sPos.ny * canvas.height
          const r  = shuttle.hitRadiusPx * scale
          if (shuttle.phase === 'in' && sPos.t >= HITTABLE_T) {
            // 進入擊球區：畫可擊光圈
            ctx.beginPath()
            ctx.arc(cx, cy, r, 0, Math.PI * 2)
            ctx.strokeStyle = 'rgba(74,222,128,0.55)'
            ctx.lineWidth = 3
            ctx.stroke()
          }
          drawShuttle(ctx, cx, cy, Math.max(18, r * 0.42))
        }
        if (sPos.t >= 1) {
          doneIdsRef.current.add(shuttle.id)
          onLandedRef.current(shuttle.id, shuttle.phase)
        }
      }

      // ── 手腕偵測＋揮速 ───────────────────────────────────
      if (!results || results.landmarks.length === 0) {
        setHandDetected(false)
        setSwingSpeed(0)
        samplesRef.current = []
        rafRef.current = requestAnimationFrame(loop)
        return
      }
      setHandDetected(true)

      const wrist: NormalizedLandmark = results.landmarks[0][0]
      const [wx, wy] = applyCalib(wrist.x, wrist.y, cal)
      const nx = isMirrored ? 1 - wx : wx
      const ny = wy

      // 揮速：近 SPEED_WINDOW_MS 內的位移 / 時間
      const samples = samplesRef.current
      samples.push({ t: now, x: nx, y: ny })
      while (samples.length > 1 && now - samples[0].t > SPEED_WINDOW_MS) samples.shift()
      let speed = 0
      if (samples.length >= 2) {
        const a = samples[0], b = samples[samples.length - 1]
        const dt = (b.t - a.t) / 1000
        if (dt > 0.03) speed = Math.hypot(b.x - a.x, b.y - a.y) / dt
      }
      setSwingSpeed(speed)

      // 約 10Hz 取樣手部軌跡（動作分析管線）
      if (trajStartRef.current < 0) trajStartRef.current = now
      if (now - lastSampleRef.current >= 100) {
        lastSampleRef.current = now
        trajRef.current.push([Math.round(now - trajStartRef.current), Math.round(nx * 1000) / 1000, Math.round(ny * 1000) / 1000])
      }

      // 手腕游標：外圈依揮速充能（達門檻變綠＝揮拍中）
      if (ctx) {
        const cx = wx * canvas.width
        const cy = wy * canvas.height
        const charged = speed >= thresholdRef.current
        ctx.beginPath()
        ctx.arc(cx, cy, 20 * scale, 0, Math.PI * 2)
        ctx.fillStyle = charged ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.2)'
        ctx.fill()
        ctx.strokeStyle = charged ? '#4ade80' : '#FFFFFF'
        ctx.lineWidth = charged ? 4 : 2.5
        ctx.stroke()
        // 拍子 emoji 跟著手腕
        ctx.save()
        ctx.scale(-1, 1)   // 抵銷 CSS 鏡像，讓 emoji 不左右顛倒
        ctx.font = `${44 * scale}px serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('🏸', -cx, cy - 34 * scale)
        ctx.restore()
      }

      // ── 擊中判定：靠近＋揮速達標＋在擊球區 ────────────────
      if (shuttle && sPos && !doneIdsRef.current.has(shuttle.id)
          && shuttle.phase === 'in' && sPos.t >= HITTABLE_T) {
        const r  = shuttle.hitRadiusPx * scale
        const dx = (nx - sPos.nx) * canvas.width
        const dy = (ny - sPos.ny) * canvas.height
        if (Math.hypot(dx, dy) < r && speed >= thresholdRef.current) {
          doneIdsRef.current.add(shuttle.id)
          onHitRef.current(shuttle.id, {
            speed: Math.round(speed * 100) / 100,
            nx: sPos.nx, ny: sPos.ny,
            reactionMs: Math.round(now - shuttle.spawnTime),
          })
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, landmarker, videoRef, canvasRef])

  return { handDetected, swingSpeed, setShuttle, getTrajectory: () => trajRef.current }
}
