'use client'

import { useEffect, useRef, useState } from 'react'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import { recordTrajectory } from '@/lib/saveSession'

export interface ShiftItem {
  id: number; x: number; y0: number; vy: number; spawnTime: number
  good: boolean; emoji: string; visualEm: number
}

interface Options {
  landmarker:  PoseLandmarker | null
  videoRef:    React.RefObject<HTMLVideoElement>
  canvasRef:   React.RefObject<HTMLCanvasElement>
  isActive:    boolean
  isMirrored:  boolean
  gain:        number      // 重心位移→接籃位移 放大倍率
  catchHalfW:  number      // 接取判定半寬（normalized）
  avatarEmoji: string
  onCaught:    (id: number, good: boolean, nx: number) => void
  onMissed:    (id: number, good: boolean) => void
}

export function itemPosY(it: ShiftItem, now: number) {
  return it.y0 + it.vy * ((now - it.spawnTime) / 1000)
}

export function usePoseShiftDetector({
  landmarker, videoRef, canvasRef, isActive, isMirrored, gain, catchHalfW, avatarEmoji, onCaught, onMissed,
}: Options) {
  const [bodyDetected, setBodyDetected] = useState(false)

  const itemsRef    = useRef<ShiftItem[]>([])
  const doneRef     = useRef(new Set<number>())
  const neutralRef  = useRef<number>(-1)   // 校正後的中立重心 x（display space）
  const avatarRef   = useRef(0.5)
  const lastNowRef  = useRef(-1)
  const trajRef     = useRef<number[][]>([])
  const trajStartRef = useRef(-1)
  const lastSampleRef = useRef(-1)
  const onCaughtRef = useRef(onCaught); onCaughtRef.current = onCaught
  const onMissedRef = useRef(onMissed); onMissedRef.current = onMissed
  const rafRef      = useRef<number | null>(null)

  function setItems(items: ShiftItem[]) {
    itemsRef.current = items
    const ids = new Set(items.map(i => i.id))
    doneRef.current.forEach(id => { if (!ids.has(id)) doneRef.current.delete(id) })
  }
  // 把目前重心設為中立點（由頁面在倒數結束時呼叫）
  function calibrate() { neutralRef.current = -1 }

  useEffect(() => {
    if (!isActive || !landmarker) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const c = canvasRef.current
      if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
      return
    }
    doneRef.current.clear()
    neutralRef.current = -1
    avatarRef.current = 0.5
    trajRef.current = []; trajStartRef.current = -1; lastSampleRef.current = -1
    recordTrajectory(trajRef.current)

    function loop() {
      const video = videoRef.current, canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(loop); return }
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480
      }
      const now = performance.now()
      if (now === lastNowRef.current) { rafRef.current = requestAnimationFrame(loop); return }
      lastNowRef.current = now

      const ctx = canvas.getContext('2d')
      const W = canvas.width, H = canvas.height
      const scale = W / 640
      if (ctx) ctx.clearRect(0, 0, W, H)

      let results
      try { results = landmarker!.detectForVideo(video, now) } catch { rafRef.current = requestAnimationFrame(loop); return }

      // ── 重心（髖部中心，退而求其次用肩）─────────────────
      let dispX = -1, hipY = -1
      if (results && results.landmarks && results.landmarks.length) {
        const lm = results.landmarks[0]
        const lHip = lm[23], rHip = lm[24], lSh = lm[11], rSh = lm[12]
        const hipVis = ((lHip?.visibility ?? 0) + (rHip?.visibility ?? 0)) / 2
        let cx: number
        if (hipVis > 0.5) { cx = (lHip.x + rHip.x) / 2; hipY = (lHip.y + rHip.y) / 2 }
        else if (((lSh?.visibility ?? 0) + (rSh?.visibility ?? 0)) / 2 > 0.5) { cx = (lSh.x + rSh.x) / 2; hipY = (lSh.y + rSh.y) / 2 }
        else cx = -1
        if (cx >= 0) dispX = isMirrored ? 1 - cx : cx
      }

      if (dispX >= 0) {
        setBodyDetected(true)
        if (neutralRef.current < 0) neutralRef.current = dispX
        const target = Math.max(0.06, Math.min(0.94, 0.5 + (dispX - neutralRef.current) * gain))
        avatarRef.current += (target - avatarRef.current) * 0.35  // EMA 平滑
        if (trajStartRef.current < 0) trajStartRef.current = now
        if (now - lastSampleRef.current >= 100) {
          lastSampleRef.current = now
          trajRef.current.push([Math.round(now - trajStartRef.current), Math.round(dispX * 1000) / 1000, Math.round(hipY * 1000) / 1000])
        }
      } else {
        setBodyDetected(false)
      }
      const ax = avatarRef.current

      // ── 落物：移動、接取判定、漏接 ────────────────────
      const catchTop = 0.78, catchBot = 0.92
      for (const it of itemsRef.current) {
        if (doneRef.current.has(it.id)) continue
        const y = itemPosY(it, now)
        if (y >= catchTop && y <= catchBot && Math.abs(it.x - ax) < catchHalfW) {
          doneRef.current.add(it.id)
          onCaughtRef.current(it.id, it.good, it.x)
          continue
        }
        if (y > 0.99) { doneRef.current.add(it.id); onMissedRef.current(it.id, it.good); continue }
        // 畫落物
        if (ctx) {
          ctx.font = `${it.visualEm * scale}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText(it.emoji, it.x * W, y * H)
        }
      }

      // ── 接籃（avatar）+ 重心條 ───────────────────────
      if (ctx) {
        // 接取區指示線
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2 * scale
        ctx.setLineDash([8 * scale, 8 * scale])
        ctx.beginPath(); ctx.moveTo(0, ((catchTop + catchBot) / 2) * H); ctx.lineTo(W, ((catchTop + catchBot) / 2) * H); ctx.stroke()
        ctx.setLineDash([])
        // 接籃
        const ay = 0.85
        ctx.font = `${68 * scale}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(avatarEmoji, ax * W, ay * H)
        // 頂部重心條
        const barY = 26 * scale, barH = 12 * scale, barX = W * 0.15, barW = W * 0.7
        ctx.fillStyle = 'rgba(255,255,255,0.18)'
        ctx.fillRect(barX, barY, barW, barH)
        ctx.fillStyle = '#22c55e'
        const knob = barX + ax * barW
        ctx.beginPath(); ctx.arc(knob, barY + barH / 2, 11 * scale, 0, Math.PI * 2); ctx.fill()
        // 中心刻度
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2 * scale
        ctx.beginPath(); ctx.moveTo(barX + barW / 2, barY - 4 * scale); ctx.lineTo(barX + barW / 2, barY + barH + 4 * scale); ctx.stroke()
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, landmarker, videoRef, canvasRef, isMirrored, gain, catchHalfW, avatarEmoji])

  return { bodyDetected, setItems, calibrate, getTrajectory: () => trajRef.current }
}
