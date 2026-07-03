'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { useCamera } from '@/hooks/useCamera'
import { setCalib, clearCalib, getCalib } from '@/lib/calibration'

export default function CalibratePage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const { landmarker, isLoading, error: lmError } = useHandLandmarker()
  const { isReady, error: camError, startCamera, stopCamera, isMirrored } = useCamera(videoRef)

  const [handDetected, setHandDetected] = useState(false)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null) // display-space
  const [saved, setSaved] = useState(false)
  const rawRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastTs = useRef(-1)

  useEffect(() => { startCamera('user'); return () => stopCamera() }, [startCamera, stopCamera])

  useEffect(() => {
    if (!isReady || !landmarker) return
    function loop() {
      const v = videoRef.current
      if (!v || v.readyState < 2) { rafRef.current = requestAnimationFrame(loop); return }
      const now = performance.now()
      if (now === lastTs.current) { rafRef.current = requestAnimationFrame(loop); return }
      lastTs.current = now
      let res
      try { res = landmarker!.detectForVideo(v, now) } catch { rafRef.current = requestAnimationFrame(loop); return }
      if (res && res.landmarks.length > 0) {
        const w = res.landmarks[0][0]
        rawRef.current = { x: w.x, y: w.y }
        setHandDetected(true)
        setCursor({ x: isMirrored ? 1 - w.x : w.x, y: w.y })
      } else {
        setHandDetected(false)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isReady, landmarker, isMirrored])

  function handleSet() {
    const r = rawRef.current
    if (!r) return
    setCalib(0.5 - r.x, 0.5 - r.y)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }
  function handleClear() {
    clearCalib()
    setSaved(false)
    alert('已清除校正，恢復預設')
  }

  const cal = typeof window !== 'undefined' ? getCalib() : { dx: 0, dy: 0 }
  const calibrated = cal.dx !== 0 || cal.dy !== 0
  const loading = !isReady || isLoading
  const hasErr = !!(camError || lmError)

  return (
    <div className="flex flex-col w-full h-screen overflow-hidden select-none bg-slate-900">
      <div className="flex items-center justify-between px-5 py-3 bg-black/60 text-white shrink-0">
        <button onClick={() => router.push('/')} className="font-semibold text-gray-300">← 首頁</button>
        <p className="font-bold">🎯 鏡頭校正</p>
        <span className={`text-xs px-2 py-1 rounded-full ${calibrated ? 'bg-green-500' : 'bg-gray-600'}`}>{calibrated ? '已校正' : '未校正'}</span>
      </div>

      <div className="relative flex-1 overflow-hidden bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" style={{ transform: isMirrored ? 'scaleX(-1)' : undefined }} />

        {/* 中央校正圈 */}
        <div className="absolute pointer-events-none" style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}>
          <div className="rounded-full border-4 border-dashed border-yellow-300 flex items-center justify-center" style={{ width: 120, height: 120, boxShadow: '0 0 30px rgba(255,214,0,0.5)' }}>
            <span className="text-yellow-300 text-3xl">＋</span>
          </div>
          <p className="text-yellow-200 text-center mt-2 text-sm font-semibold">把手放這裡</p>
        </div>

        {/* 即時手部游標 */}
        {handDetected && cursor && (
          <div className="absolute pointer-events-none" style={{ left: `calc(${cursor.x * 100}% - 22px)`, top: `calc(${cursor.y * 100}% - 22px)`, width: 44, height: 44, borderRadius: '50%', background: 'rgba(70,224,255,0.25)', border: '3px solid #46e0ff', boxShadow: '0 0 16px rgba(70,224,255,0.7)' }} />
        )}

        {(loading || hasErr) && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 text-white">
            {hasErr ? <><p className="text-4xl">⚠️</p><p className="px-6 text-center">{camError?.message ?? lmError}</p></> : <><p className="text-4xl animate-pulse">⏳</p><p>準備鏡頭與 AI…</p></>}
          </div>
        )}

        {!handDetected && !loading && !hasErr && (
          <div className="absolute bottom-28 inset-x-0 flex justify-center pointer-events-none"><div className="bg-black/65 text-white px-5 py-2.5 rounded-full font-semibold">🖐 請把手放到鏡頭前</div></div>
        )}

        {saved && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-green-500 text-white px-8 py-4 rounded-2xl text-2xl font-black shadow-xl">✅ 校正完成！</div>
          </div>
        )}
      </div>

      <div className="bg-slate-800 px-5 py-4 shrink-0 flex flex-col gap-3">
        <p className="text-gray-300 text-sm text-center">把手伸到你<strong className="text-white">舒適的中間位置</strong>、對準黃色圈圈，按下「設為中立點」。之後所有遊戲的手部對位都會以此為基準。</p>
        <div className="flex gap-3">
          <button onClick={handleClear} className="flex-1 py-3 rounded-xl border-2 border-slate-600 text-gray-300 font-semibold">清除校正</button>
          <button onClick={handleSet} disabled={!handDetected} className="flex-[2] py-3 rounded-xl bg-yellow-400 text-slate-900 font-extrabold text-lg disabled:opacity-40 active:scale-95">設為中立點 🎯</button>
        </div>
      </div>
    </div>
  )
}
