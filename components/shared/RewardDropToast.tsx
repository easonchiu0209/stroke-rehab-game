'use client'

// 獎勵回流 hub 的全域掉落通知：掛在 root layout，
// 監聽 lib/saveSession 廣播的 'lmx:drop' 事件，任何遊戲結算都會觸發。
// 稀有禮包有加強演出（適老：無閃爍、動畫平滑、停留夠久）。

import { useEffect, useState } from 'react'

interface Drop { coins: number; pearls: number; rare: boolean }

export default function RewardDropToast() {
  const [drop, setDrop] = useState<Drop | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onDrop = (e: Event) => {
      const d = (e as CustomEvent<Drop>).detail
      if (!d || (!d.coins && !d.pearls)) return
      setDrop(d)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setDrop(null), d.rare ? 6000 : 4200)
    }
    window.addEventListener('lmx:drop', onDrop)
    return () => {
      window.removeEventListener('lmx:drop', onDrop)
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (!drop) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] pointer-events-none">
      <div
        className={`flex items-center gap-3 rounded-2xl px-5 py-3 shadow-xl border-2 ${
          drop.rare
            ? 'bg-gradient-to-r from-amber-100 to-yellow-50 border-amber-400'
            : 'bg-white/95 border-emerald-300'
        }`}
        style={{ animation: 'juicePopIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <span className="text-3xl">{drop.rare ? '🎁' : '🌾'}</span>
        <div>
          <p className={`font-extrabold ${drop.rare ? 'text-amber-800' : 'text-emerald-800'}`}>
            {drop.rare ? '稀有大禮包！' : '訓練獎勵'}
          </p>
          <p className="text-sm font-semibold text-slate-600">
            農場金幣 +{drop.coins}
            {drop.pearls > 0 && <span>　珍珠 +{drop.pearls} 🫧</span>}
          </p>
        </div>
      </div>
    </div>
  )
}
