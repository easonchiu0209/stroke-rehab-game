'use client'

// 家人分享卡（獎勵體系第一優先）：把本月訓練成果生成一張暖色成就卡，
// 一鍵分享到 LINE 給家人（Web Share API），或下載圖片。
// 文案只呈現數據事實＋固定鼓勵語（合規：無醫療宣稱）。

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'

interface Stats {
  name: string
  monthLabel: string
  days: number
  sessions: number
  avgAcc: number | null
  streak: number
  romDelta: number | null
}

const W = 1080, H = 1350

function drawCard(canvas: HTMLCanvasElement, s: Stats) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = W; canvas.height = H

  // 暖色漸層底
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#fff7ed'); bg.addColorStop(1, '#ffedd5')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

  // 頂部緞帶
  const ribbon = ctx.createLinearGradient(0, 0, W, 0)
  ribbon.addColorStop(0, '#f59e0b'); ribbon.addColorStop(1, '#f97316')
  ctx.fillStyle = ribbon; ctx.fillRect(0, 0, W, 24)

  ctx.textAlign = 'center'

  // 標題
  ctx.font = '120px serif'
  ctx.fillText('🏅', W / 2, 200)
  ctx.fillStyle = '#7c2d12'
  ctx.font = '900 72px "Microsoft JhengHei", sans-serif'
  ctx.fillText(`${s.name} 的訓練成績單`, W / 2, 320)
  ctx.fillStyle = '#b45309'
  ctx.font = '700 44px "Microsoft JhengHei", sans-serif'
  ctx.fillText(`—— ${s.monthLabel}份 ——`, W / 2, 395)

  // 統計列
  const rows: [string, string][] = [
    ['📅', `這個月練了 ${s.days} 天`],
    ['🎮', `完成 ${s.sessions} 場訓練`],
  ]
  if (s.avgAcc != null) rows.push(['🎯', `平均命中率 ${s.avgAcc}%`])
  if (s.streak >= 2) rows.push(['🔥', `連續 ${s.streak} 天沒有間斷`])
  if (s.romDelta != null) rows.push(['💪', `肩膀比上個月多抬高 ${s.romDelta}°`])

  let y = 520
  for (const [emoji, text] of rows) {
    // 卡片列
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    roundRect(ctx, 90, y - 62, W - 180, 96, 28)
    ctx.fill()
    ctx.font = '52px serif'
    ctx.textAlign = 'left'
    ctx.fillText(emoji, 130, y + 6)
    ctx.fillStyle = '#1e293b'
    ctx.font = '700 48px "Microsoft JhengHei", sans-serif'
    ctx.fillText(text, 220, y + 4)
    ctx.textAlign = 'center'
    y += 130
  }

  // 鼓勵語（固定模板）
  ctx.fillStyle = '#9a3412'
  ctx.font = '800 52px "Microsoft JhengHei", sans-serif'
  ctx.fillText(s.days >= 15 ? '每天的努力，家人都看得到 ❤️' : '一步一步，持續就是進步 ❤️', W / 2, y + 60)

  // 署名
  ctx.fillStyle = '#c2703d'
  ctx.font = '600 36px "Microsoft JhengHei", sans-serif'
  ctx.fillText('LifeMotionXR 復能訓練平台', W / 2, H - 90)
  ctx.font = '500 30px "Microsoft JhengHei", sans-serif'
  ctx.fillText(new Date().toLocaleDateString('zh-TW'), W / 2, H - 44)
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

export default function ShareCardPage() {
  const router = useRouter()
  const { status } = useSession()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [empty, setEmpty] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') signIn('line')
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/share-card').then(r => r.json()).then(d => {
      if (!d.stats || d.stats.sessions === 0) { setEmpty(true); return }
      setStats(d.stats)
    }).catch(() => setEmpty(true))
  }, [status])

  useEffect(() => {
    if (stats && canvasRef.current) drawCard(canvasRef.current, stats)
  }, [stats])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  async function toBlob(): Promise<Blob | null> {
    return new Promise(res => canvasRef.current?.toBlob(b => res(b), 'image/png') ?? res(null))
  }

  async function share() {
    const blob = await toBlob()
    if (!blob) return
    const file = new File([blob], 'lifemotionxr-成績單.png', { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '我的訓練成績單' })
        return
      } catch { /* 使用者取消：不動作 */ }
    } else {
      download()
      showToast('已下載圖片，打開 LINE 傳給家人吧！')
    }
  }

  function download() {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = 'lifemotionxr-成績單.png'
    a.click()
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 flex flex-col items-center px-5 py-8 gap-5">
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl bg-slate-800 text-white font-semibold shadow-xl">{toast}</div>
      )}

      <div className="text-center">
        <h1 className="text-3xl font-extrabold text-slate-900">🎁 家人分享卡</h1>
        <p className="text-slate-500 mt-1 text-sm">把這個月的努力做成卡片，傳給家人看看</p>
      </div>

      {empty ? (
        <div className="text-center py-16">
          <p className="text-5xl mb-4">🌱</p>
          <p className="text-slate-600 font-semibold">這個月還沒有訓練紀錄</p>
          <p className="text-slate-400 text-sm mt-1">先玩一場遊戲，再回來做成績單吧！</p>
        </div>
      ) : !stats ? (
        <p className="text-slate-400 py-16 animate-pulse">產生中…</p>
      ) : (
        <>
          <canvas ref={canvasRef} className="w-full max-w-sm rounded-2xl shadow-lg border border-orange-200" style={{ aspectRatio: '4/5' }} />
          <div className="flex gap-3 w-full max-w-sm">
            <button onClick={download} className="flex-1 py-4 rounded-xl border-2 border-slate-300 text-slate-700 font-semibold text-lg hover:bg-white active:scale-[0.97]">
              ⬇ 下載
            </button>
            <button onClick={share} className="flex-[2] py-4 rounded-xl bg-green-600 text-white font-extrabold text-xl shadow-lg hover:bg-green-700 active:scale-[0.97]">
              📤 分享給家人
            </button>
          </div>
        </>
      )}

      <button onClick={() => router.push('/')} className="mt-2 px-8 py-3 rounded-2xl border-2 border-slate-200 text-slate-500 font-semibold hover:bg-white">
        ← 返回首頁
      </button>
    </main>
  )
}
