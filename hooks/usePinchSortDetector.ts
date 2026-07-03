'use client'

import { useEffect, useRef, useState } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { recordTrajectory } from '@/lib/saveSession'
import { getCalib, applyCalib } from '@/lib/calibration'

export interface SortBin { category: string; label: string; color: string; cx: number }
export interface SortItem { id: number; category: string; emoji: string; nx: number; ny: number; spawnTime: number }

interface Options {
  landmarker:   HandLandmarker | null
  videoRef:     React.RefObject<HTMLVideoElement>
  canvasRef:    React.RefObject<HTMLCanvasElement>
  isActive:     boolean
  isMirrored:   boolean
  bins:         SortBin[]
  grabRadiusPx: number
  visualEm:     number
  onSorted:     (id: number, correct: boolean, binCategory: string, nx: number, ny: number, reactionMs: number) => void
  onGrab?:      () => void
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function usePinchSortDetector({
  landmarker, videoRef, canvasRef, isActive, isMirrored, bins, grabRadiusPx, visualEm, onSorted, onGrab,
}: Options) {
  const [handDetected, setHandDetected] = useState(false)

  const itemsRef    = useRef<SortItem[]>([])
  const heldRef     = useRef<number>(-1)
  const wasPinchRef = useRef(false)
  const trajRef     = useRef<number[][]>([])
  const trajStartRef = useRef(-1)
  const lastSampleRef = useRef(-1)
  const binsRef     = useRef(bins);     binsRef.current = bins
  const onSortedRef = useRef(onSorted); onSortedRef.current = onSorted
  const onGrabRef   = useRef(onGrab);   onGrabRef.current = onGrab
  const rafRef      = useRef<number | null>(null)

  function setItems(items: SortItem[]) {
    const held = heldRef.current
    const prev = itemsRef.current.find(i => i.id === held)
    itemsRef.current = items.map(i => (i.id === held && prev) ? { ...i, nx: prev.nx, ny: prev.ny } : i)
  }

  useEffect(() => {
    if (!isActive || !landmarker) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const c = canvasRef.current
      if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
      return
    }
    heldRef.current = -1
    wasPinchRef.current = false
    trajRef.current = []; trajStartRef.current = -1; lastSampleRef.current = -1
    recordTrajectory(trajRef.current)
    const cal = getCalib()

    function loop() {
      const video = videoRef.current, canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(loop); return }
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480
      }
      const now = performance.now()
      const ctx = canvas.getContext('2d')
      const W = canvas.width, H = canvas.height
      const scale = W / 640
      if (ctx) ctx.clearRect(0, 0, W, H)

      const binCount = binsRef.current.length
      const binW = Math.min(W * 0.92 / binCount, W * 0.42)
      const binH = H * 0.2
      const by = H * 0.77

      // ── 籃子 ──────────────────────────────────────────────
      if (ctx) {
        for (const b of binsRef.current) {
          const bx = b.cx * W
          ctx.save()
          ctx.fillStyle = b.color + '40'
          ctx.strokeStyle = b.color
          ctx.lineWidth = 5 * scale
          roundRect(ctx, bx - binW / 2, by, binW, binH, 18 * scale)
          ctx.fill(); ctx.stroke()
          ctx.font = `${52 * scale}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText('🧺', bx, by + binH * 0.52)
          ctx.restore()
        }
      }

      let results
      try { results = landmarker!.detectForVideo(video, now) } catch { rafRef.current = requestAnimationFrame(loop); return }

      // ── 游標 + 捏握 ──────────────────────────────────────
      let aimNx = -1, aimNy = -1, isPinch = false
      if (results && results.landmarks.length) {
        setHandDetected(true)
        const lm = results.landmarks[0]
        const [tx, ty] = applyCalib(lm[8].x, lm[8].y, cal)
        aimNx = isMirrored ? 1 - tx : tx; aimNy = ty
        const thumb = lm[4], idx = lm[8], wrist = lm[0], midMcp = lm[9]
        const pd = Math.hypot(thumb.x - idx.x, thumb.y - idx.y)
        const hs = Math.hypot(wrist.x - midMcp.x, wrist.y - midMcp.y) || 1e-4
        isPinch = pd / hs < 0.5
        if (trajStartRef.current < 0) trajStartRef.current = now
        if (now - lastSampleRef.current >= 100) {
          lastSampleRef.current = now
          trajRef.current.push([Math.round(now - trajStartRef.current), Math.round(aimNx * 1000) / 1000, Math.round(aimNy * 1000) / 1000])
        }
      } else {
        setHandDetected(false)
      }

      // ── 抓取 / 拖曳 / 放下 ───────────────────────────────
      if (aimNx >= 0) {
        if (heldRef.current >= 0) {
          const it = itemsRef.current.find(i => i.id === heldRef.current)
          if (it) { it.nx = aimNx; it.ny = aimNy }
        }
        if (isPinch && !wasPinchRef.current && heldRef.current < 0) {
          let best: SortItem | null = null, bestD = Infinity
          for (const it of itemsRef.current) {
            const d = Math.hypot((aimNx - it.nx) * W, (aimNy - it.ny) * H)
            if (d < grabRadiusPx * scale && d < bestD) { best = it; bestD = d }
          }
          if (best) { heldRef.current = best.id; onGrabRef.current?.() }
        }
        if (!isPinch && wasPinchRef.current && heldRef.current >= 0) {
          const it = itemsRef.current.find(i => i.id === heldRef.current)
          heldRef.current = -1
          if (it) {
            let dropped: SortBin | null = null
            if (aimNy * H >= by - binH * 0.25) {
              for (const b of binsRef.current) {
                if (Math.abs(aimNx - b.cx) * W < binW / 2) { dropped = b; break }
              }
            }
            if (dropped) onSortedRef.current(it.id, dropped.category === it.category, dropped.category, aimNx, aimNy, Math.round(now - it.spawnTime))
          }
        }
      }
      wasPinchRef.current = isPinch

      // ── 物件 ──────────────────────────────────────────────
      if (ctx) {
        for (const it of itemsRef.current) {
          const held = it.id === heldRef.current
          const cx = it.nx * W, cy = it.ny * H
          if (held) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 14 * scale; ctx.shadowOffsetY = 4 * scale }
          ctx.font = `${(held ? visualEm * 1.18 : visualEm) * scale}px serif`
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText(it.emoji, cx, cy)
          if (held) ctx.restore()
        }
      }

      // ── 手部游標 ─────────────────────────────────────────
      if (ctx && aimNx >= 0) {
        const cx = aimNx * W, cy = aimNy * H, r = 22 * scale
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = isPinch ? '#ff6b6b' : '#34d399'; ctx.lineWidth = 4 * scale; ctx.stroke()
        ctx.fillStyle = isPinch ? 'rgba(255,107,107,0.25)' : 'rgba(52,211,153,0.16)'; ctx.fill()
        ctx.beginPath(); ctx.arc(cx, cy, 3 * scale, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle as string; ctx.fill()
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, landmarker, videoRef, canvasRef, isMirrored, grabRadiusPx, visualEm])

  return { handDetected, setItems, getTrajectory: () => trajRef.current }
}
