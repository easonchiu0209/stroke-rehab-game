'use client'

// 背景 Pose 監測：在手部遊戲進行時以 ~10Hz 偵測上半身姿勢，
// (1) 錄製動作序列（存 motion_frames 供品質分析）
// (2) 規則式代償偵測：聳肩 shrug / 軀幹前傾 trunk_lean / 軀幹側彎 trunk_tilt
// 遊戲頁只要一行接入：usePoseMonitor({ videoRef, isMirrored, active })
// 資料經 lib/saveSession 的共享暫存，saveGameSession 會自動附上。

import { useEffect, useRef, useState } from 'react'
import { usePoseLandmarker } from './usePoseLandmarker'
import { recordPose, type CompensationType, type CompensationEvent, type PoseRecording } from '@/lib/saveSession'
import { speak } from '@/lib/feedback'

// 錄製的 landmark：鼻 0、耳 7/8、肩 11/12、肘 13/14、腕 15/16、髖 23/24
const LM_IDS = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24]
const SAMPLE_MS = 100          // ~10Hz
const BASELINE_FRAMES = 12     // 前 ~1.2 秒有效幀當基準（倒數階段就開始收）
const ONSET_FRAMES = 5         // 條件連續 5 幀（~0.5s）才算事件開始（防抖）
const RELEASE_FRAMES = 4       // 條件消失連續 4 幀才算事件結束
const HINT_SHOW_MS = 2600
const VOICE_COOLDOWN_MS = 10000

const HINTS: Record<CompensationType, string> = {
  shrug:      '肩膀放輕鬆，慢慢來就好',
  trunk_lean: '身體坐正，用手去搆就好',
  trunk_tilt: '身體保持正正的，不用歪喔',
}

interface Baseline { neckLen: number; tiltDeg: number; shoulderW: number; torsoLen: number | null }
interface FrameMetrics { neckLen: number; tiltDeg: number; shoulderW: number; torsoLen: number | null }

interface Options {
  videoRef:   React.RefObject<HTMLVideoElement>
  isMirrored: boolean
  active:     boolean   // 建議傳 phase==='countdown'||phase==='playing'（倒數時收基準）
}

export function usePoseMonitor({ videoRef, isMirrored, active }: Options) {
  const { landmarker } = usePoseLandmarker()
  const [hint, setHint] = useState<string | null>(null)

  const recRef       = useRef<PoseRecording | null>(null)
  const startRef     = useRef(-1)
  const baseRef      = useRef<Baseline | null>(null)
  const baseBufRef   = useRef<FrameMetrics[]>([])
  // 每種代償的事件狀態機
  const stateRef     = useRef<Record<CompensationType, { on: number; off: number; startT: number; peak: number }>>({
    shrug:      { on: 0, off: 0, startT: -1, peak: 0 },
    trunk_lean: { on: 0, off: 0, startT: -1, peak: 0 },
    trunk_tilt: { on: 0, off: 0, startT: -1, peak: 0 },
  })
  const lastVoiceRef = useRef(-Infinity)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!active || !landmarker) return
    const video = videoRef.current
    if (!video) return

    // 每場重置
    const rec: PoseRecording = { landmarkIds: LM_IDS, fps: 1000 / SAMPLE_MS, frames: [], events: [] }
    recRef.current = rec
    recordPose(rec)
    startRef.current = -1
    baseRef.current = null
    baseBufRef.current = []
    for (const k of Object.keys(stateRef.current) as CompensationType[]) {
      stateRef.current[k] = { on: 0, off: 0, startT: -1, peak: 0 }
    }

    function closeEvent(type: CompensationType, nowT: number) {
      const st = stateRef.current[type]
      if (st.startT < 0) return
      rec.events.push({
        t_ms: Math.round(st.startT),
        dur_ms: Math.round(nowT - st.startT),
        type,
        severity: Math.round(st.peak * 100) / 100,
      })
      stateRef.current[type] = { on: 0, off: 0, startT: -1, peak: 0 }
    }

    function feed(type: CompensationType, triggered: boolean, severity: number, nowT: number) {
      const st = stateRef.current[type]
      if (triggered) {
        st.on++; st.off = 0
        if (st.startT < 0 && st.on >= ONSET_FRAMES) {
          st.startT = nowT
          st.peak = severity
          // 溫和提示（畫面 + 語音，語音有冷卻）
          setHint(HINTS[type])
          if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
          hintTimerRef.current = setTimeout(() => setHint(null), HINT_SHOW_MS)
          const now = performance.now()
          if (now - lastVoiceRef.current > VOICE_COOLDOWN_MS) {
            lastVoiceRef.current = now
            try { speak(HINTS[type]) } catch { /* 無語音支援時略過 */ }
          }
        }
        if (st.startT >= 0) st.peak = Math.max(st.peak, severity)
      } else if (st.startT >= 0) {
        st.off++
        if (st.off >= RELEASE_FRAMES) closeEvent(type, nowT)
      } else {
        st.on = 0
      }
    }

    const timer = setInterval(() => {
      if (!video || video.readyState < 2) return
      const now = performance.now()
      let results
      try { results = landmarker.detectForVideo(video, now) } catch { return }
      if (!results?.landmarks?.length) return
      const lm = results.landmarks[0]

      const vis = (i: number) => lm[i]?.visibility ?? 0
      if ((vis(11) + vis(12)) / 2 < 0.5) return   // 肩不可見就跳過這幀

      if (startRef.current < 0) startRef.current = now
      const t = now - startRef.current

      // 錄製幀（display space：鏡像翻正 x）
      const frame: number[] = [Math.round(t)]
      for (const id of LM_IDS) {
        const p = lm[id]
        const x = p ? (isMirrored ? 1 - p.x : p.x) : -1
        const y = p ? p.y : -1
        frame.push(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000)
      }
      rec.frames.push(frame)

      // ── 幀特徵 ─────────────────────────────────────
      const shMidY = (lm[11].y + lm[12].y) / 2
      const neckLen = shMidY - lm[0].y                     // 鼻→肩垂直距離（聳肩會縮短）
      const tiltDeg = Math.atan2(lm[12].y - lm[11].y, lm[12].x - lm[11].x) * 180 / Math.PI
      const shoulderW = Math.abs(lm[12].x - lm[11].x)      // 前傾靠近鏡頭會變寬
      const hipOk = (vis(23) + vis(24)) / 2 > 0.4
      const torsoLen = hipOk ? (lm[23].y + lm[24].y) / 2 - shMidY : null
      const m: FrameMetrics = { neckLen, tiltDeg, shoulderW, torsoLen }

      // ── 基準線（前 N 有效幀平均）────────────────────
      if (!baseRef.current) {
        baseBufRef.current.push(m)
        if (baseBufRef.current.length >= BASELINE_FRAMES) {
          const buf = baseBufRef.current
          const avg = (f: (x: FrameMetrics) => number) => buf.reduce((s, x) => s + f(x), 0) / buf.length
          const torsos = buf.filter(x => x.torsoLen != null)
          baseRef.current = {
            neckLen:   avg(x => x.neckLen),
            tiltDeg:   avg(x => x.tiltDeg),
            shoulderW: avg(x => x.shoulderW),
            torsoLen:  torsos.length >= BASELINE_FRAMES / 2
              ? torsos.reduce((s, x) => s + (x.torsoLen as number), 0) / torsos.length
              : null,
          }
        }
        return
      }
      const base = baseRef.current
      if (base.neckLen <= 0.02 || base.shoulderW <= 0.02) return  // 基準異常，不判定

      // ── 規則判定 ────────────────────────────────────
      // 聳肩：鼻→肩距離縮短 25% 以上
      const shrugRatio = 1 - neckLen / base.neckLen
      feed('shrug', shrugRatio > 0.25, Math.min(1, shrugRatio / 0.5), t)

      // 側彎：肩線角度偏離基準 > 12°
      const tiltDelta = Math.abs(tiltDeg - base.tiltDeg)
      feed('trunk_tilt', tiltDelta > 12, Math.min(1, tiltDelta / 30), t)

      // 前傾：肩寬放大 22% 以上（靠近鏡頭），或軀幹長度縮短 20% 以上
      const widen = shoulderW / base.shoulderW - 1
      const torsoShrink = base.torsoLen != null && torsoLen != null
        ? 1 - torsoLen / base.torsoLen : 0
      const leanSev = Math.max(widen / 0.44, torsoShrink / 0.4)
      feed('trunk_lean', widen > 0.22 || torsoShrink > 0.2, Math.min(1, Math.max(0, leanSev)), t)
    }, SAMPLE_MS)

    return () => {
      clearInterval(timer)
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
      // 收尾：把還開著的事件關閉，資料留在共享暫存等 saveGameSession 取走
      const endT = startRef.current >= 0 ? performance.now() - startRef.current : 0
      for (const k of Object.keys(stateRef.current) as CompensationType[]) closeEvent(k, endT)
      setHint(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, landmarker, isMirrored])

  return { hint }
}

export type { CompensationEvent }
