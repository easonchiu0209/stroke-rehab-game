'use client'

import { useEffect, useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface Prize {
  id:          string
  name:        string
  description: string | null
  image_emoji: string
  points_cost: number
  stock:       number | null
  category:    string
}

const CATEGORY_LABELS: Record<string, string> = {
  digital:  '虛擬獎品',
  physical: '實體禮品',
  unlock:   '關卡解鎖',
}

interface UnlockItem {
  kind: 'farm' | 'fish' | 'egg' | 'title' | 'frame' | 'theme'
  id: string
  name: string
  emoji: string
  points: number
  owned: boolean
  repeatable?: boolean
  desc?: string
}

export default function PrizesPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [prizes,    setPrizes]    = useState<Prize[]>([])
  const [unlocks,   setUnlocks]   = useState<UnlockItem[]>([])
  const [loading,   setLoading]   = useState(true)
  const [redeeming, setRedeeming] = useState<string | null>(null)
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null)
  const [ptsOverride, setPtsOverride] = useState<number | null>(null)

  useEffect(() => {
    // 獎勵經濟決策（2026-07-06）：個案端只展示平台內虛擬獎勵，實體獎品由機構端提供
    fetch('/api/prizes')
      .then(r => r.json())
      .then(data => { setPrizes((data as Prize[]).filter(p => p.category !== 'physical')); setLoading(false) })
    fetch('/api/redeem-virtual')
      .then(r => r.json())
      .then(d => setUnlocks(d.items ?? []))
      .catch(() => { /* ignore */ })
  }, [])

  const handleUnlock = async (item: UnlockItem) => {
    if (!session) { signIn('line'); return }
    if (userPoints < item.points) { showToast(`積分不足（需要 ${item.points}，你有 ${userPoints}）`, false); return }
    setRedeeming(`${item.kind}:${item.id}`)
    try {
      const res = await fetch('/api/redeem-virtual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: item.kind, id: item.id }),
      })
      const d = await res.json()
      if (res.ok) {
        setPtsOverride(d.remainingPoints)
        if (item.kind === 'egg' && d.egg) {
          // 驚喜蛋開獎
          const msg = d.egg.type === 'deco'
            ? `🎊 開出限定裝飾 ${d.egg.deco.emoji} ${d.egg.deco.name}！`
            : d.egg.type === 'pearls' ? `開出 🫧 珍珠 ×${d.egg.amount}！` : `開出 🪙 金幣 ×${d.egg.amount}！`
          showToast(msg, true)
          if (d.egg.type !== 'deco') {
            window.dispatchEvent(new CustomEvent('lmx:drop', {
              detail: { coins: d.egg.type === 'coins' ? d.egg.amount : 0, pearls: d.egg.type === 'pearls' ? d.egg.amount : 0, rare: false },
            }))
          }
        } else {
          const dest = item.kind === 'farm' ? '，快去農場看看' : item.kind === 'fish' ? '，快去水族箱看看' : item.kind === 'theme' ? '，農場和水族箱換上新裝囉' : '，社群和排行榜看得到囉'
          showToast(`🎉 獲得 ${item.emoji} ${item.name}${dest}`, true)
          if (!item.repeatable) {
            setUnlocks(prev => prev.map(u => u.kind === item.kind && u.id === item.id ? { ...u, owned: true } : u))
          }
        }
      } else showToast(d.error ?? '兌換失敗', false)
    } finally {
      setRedeeming(null)
    }
  }

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const userPoints = ptsOverride ?? (session?.user.totalPoints ?? 0)

  const handleExchange = async (to: 'coins' | 'pearls', points: number) => {
    if (!session) { signIn('line'); return }
    if (userPoints < points) { showToast(`積分不足（需 ${points}）`, false); return }
    const res = await fetch('/api/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, points }) })
    const d = await res.json()
    if (res.ok) { setPtsOverride(d.remainingPoints); showToast(`✅ 換得 ${d.gained} ${to === 'coins' ? '🪙 農場金幣' : '🫧 水族箱珍珠'}`, true) }
    else showToast(d.error ?? '兌換失敗', false)
  }

  const handleRedeem = async (prize: Prize) => {
    if (!session) { signIn('line'); return }
    if (userPoints < prize.points_cost) {
      showToast(`積分不足（需要 ${prize.points_cost}，你有 ${userPoints}）`, false)
      return
    }
    setRedeeming(prize.id)
    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prize_id: prize.id }),
      })
      const data = await res.json()
      if (res.ok) {
        showToast(`🎉 兌換成功！工作人員將確認後發送「${prize.name}」`, true)
        setPtsOverride(userPoints - prize.points_cost)
      } else {
        showToast(data.error ?? '兌換失敗', false)
      }
    } finally {
      setRedeeming(null)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-50 to-pink-50 flex flex-col items-center px-5 py-10 gap-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl text-white font-semibold shadow-xl text-center max-w-sm ${
          toast.ok ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="text-center">
        <div className="text-6xl mb-2">🎁</div>
        <h1 className="text-4xl font-extrabold text-slate-900">兌換中心</h1>
        <p className="text-slate-500 mt-1 text-sm">訓練賺積分，換遊戲幣、解鎖稀有夥伴</p>
        {session
          ? <p className="text-purple-700 font-bold mt-1 text-xl">你有 {userPoints.toLocaleString()} 積分</p>
          : <p className="text-slate-500 mt-1">登入後可兌換獎品</p>
        }
      </div>

      {!session && (
        <button
          onClick={() => signIn('line')}
          className="px-8 py-3 rounded-2xl font-bold text-white text-lg"
          style={{ background: '#06C755' }}
        >
          LINE 登入後兌換
        </button>
      )}

      {/* 積分兌換遊戲幣 */}
      {session && (
        <div className="w-full max-w-lg bg-white rounded-2xl border border-amber-200 p-5 shadow-sm">
          <p className="font-bold text-slate-800 mb-1">🔄 積分兌換遊戲幣</p>
          <p className="text-xs text-slate-400 mb-3">用平台積分換農場金幣或水族箱珍珠（單向，不可換回積分）。金幣 1:1、珍珠 2:1。</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { to: 'coins' as const, pts: 50, label: '🪙 50 金幣', cost: 50 },
              { to: 'coins' as const, pts: 100, label: '🪙 100 金幣', cost: 100 },
              { to: 'pearls' as const, pts: 50, label: '🫧 25 珍珠', cost: 50 },
              { to: 'pearls' as const, pts: 100, label: '🫧 50 珍珠', cost: 100 },
            ].map((b, i) => (
              <button key={i} onClick={() => handleExchange(b.to, b.pts)} disabled={userPoints < b.cost}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl border-2 border-amber-100 bg-amber-50 disabled:opacity-40 active:scale-95">
                <span className="font-bold text-slate-700">{b.label}</span>
                <span className="text-sm text-amber-600 font-semibold">{b.cost}分</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 驚喜蛋（即時爽感層，可重複購買） */}
      {session && unlocks.some(u => u.kind === 'egg') && (() => {
        const egg = unlocks.find(u => u.kind === 'egg')!
        const afford = userPoints >= egg.points
        return (
          <div className="w-full max-w-lg bg-gradient-to-r from-yellow-50 to-amber-50 rounded-2xl border border-amber-200 p-5 shadow-sm flex items-center gap-4">
            <span className="text-5xl">🎲</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-800">驚喜蛋</p>
              <p className="text-xs text-slate-500">{egg.desc}</p>
            </div>
            <button onClick={() => handleUnlock(egg)} disabled={!afford || redeeming === 'egg:egg'}
              className="px-4 py-2.5 rounded-xl bg-amber-500 text-white font-bold active:scale-95 disabled:opacity-40 shrink-0">
              {redeeming === 'egg:egg' ? '開蛋中…' : `開一顆 ${egg.points}分`}
            </button>
          </div>
        )
      })()}

      {/* 佈景主題 */}
      {unlocks.some(u => u.kind === 'theme') && (
        <div className="w-full max-w-lg bg-white rounded-2xl border border-teal-200 p-5 shadow-sm">
          <p className="font-bold text-slate-800 mb-1">🎨 佈景主題</p>
          <p className="text-xs text-slate-400 mb-3">換上新佈景，農場和水族箱立刻換季（兌換後可用 🎨 鈕隨時切換）。</p>
          <div className="grid grid-cols-3 gap-2">
            {unlocks.filter(u => u.kind === 'theme').map(item => {
              const key = `${item.kind}:${item.id}`
              const afford = session && userPoints >= item.points
              return (
                <button key={key} onClick={() => handleUnlock(item)} disabled={item.owned || redeeming === key}
                  className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border-2 transition-all ${
                    item.owned ? 'border-green-200 bg-green-50 opacity-70' : afford ? 'border-teal-200 bg-teal-50 active:scale-95' : 'border-slate-100 bg-slate-50 opacity-60'
                  }`}>
                  <span className="text-3xl">{item.emoji}</span>
                  <span className="font-bold text-slate-800 text-sm">{item.name}</span>
                  <span className={`text-xs font-semibold ${item.owned ? 'text-green-600' : 'text-teal-600'}`}>
                    {item.owned ? '✓ 已擁有' : redeeming === key ? '…' : `${item.points} 積分`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 榮譽：稱號與頭像框 */}
      {unlocks.some(u => u.kind === 'title' || u.kind === 'frame') && (
        <div className="w-full max-w-lg bg-white rounded-2xl border border-indigo-200 p-5 shadow-sm">
          <p className="font-bold text-slate-800 mb-1">🎖️ 榮譽獎勵</p>
          <p className="text-xs text-slate-400 mb-3">稱號與頭像框會顯示在社群和排行榜，讓大家看見你的努力。</p>
          <div className="grid grid-cols-2 gap-2">
            {unlocks.filter(u => u.kind === 'title' || u.kind === 'frame').map(item => {
              const key = `${item.kind}:${item.id}`
              const afford = session && userPoints >= item.points
              return (
                <button key={key} onClick={() => handleUnlock(item)} disabled={item.owned || redeeming === key}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                    item.owned ? 'border-green-200 bg-green-50 opacity-70' : afford ? 'border-indigo-200 bg-indigo-50 active:scale-95' : 'border-slate-100 bg-slate-50 opacity-60'
                  }`}>
                  <span className="text-3xl">{item.emoji}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-slate-800 text-sm">{item.name}</span>
                    <span className={`block text-xs font-semibold ${item.owned ? 'text-green-600' : 'text-indigo-600'}`}>
                      {item.owned ? '✓ 已擁有' : redeeming === key ? '處理中…' : `${item.points} 積分`}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 稀有解鎖券：用積分直接解鎖高階物種 */}
      {unlocks.length > 0 && (
        <div className="w-full max-w-lg bg-white rounded-2xl border border-purple-200 p-5 shadow-sm">
          <p className="font-bold text-slate-800 mb-1">✨ 稀有解鎖券</p>
          <p className="text-xs text-slate-400 mb-3">用訓練積分直接解鎖農場與水族箱的稀有夥伴，不用慢慢存金幣珍珠。</p>
          <div className="grid grid-cols-2 gap-2">
            {unlocks.filter(u => u.kind === 'farm' || u.kind === 'fish').map(item => {
              const key = `${item.kind}:${item.id}`
              const afford = session && userPoints >= item.points
              return (
                <button
                  key={key}
                  onClick={() => handleUnlock(item)}
                  disabled={item.owned || redeeming === key}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                    item.owned
                      ? 'border-green-200 bg-green-50 opacity-70'
                      : afford
                      ? 'border-purple-200 bg-purple-50 active:scale-95'
                      : 'border-slate-100 bg-slate-50 opacity-60'
                  }`}
                >
                  <span className="text-3xl">{item.emoji}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-slate-800 text-sm">{item.name}</span>
                    <span className={`block text-xs font-semibold ${item.owned ? 'text-green-600' : 'text-purple-600'}`}>
                      {item.owned ? '✓ 已解鎖' : redeeming === key ? '處理中…' : `${item.points} 積分`}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400 animate-pulse text-xl">載入獎品中…</div>
      ) : (
        <div className="w-full max-w-lg grid grid-cols-1 gap-4">
          {prizes.map(prize => {
            const canRedeem = session && userPoints >= prize.points_cost
            const outOfStock = prize.stock !== null && prize.stock <= 0
            return (
              <div key={prize.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex gap-4 items-center">
                <div className="text-5xl shrink-0">{prize.image_emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-bold text-slate-900">{prize.name}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                      {CATEGORY_LABELS[prize.category] ?? prize.category}
                    </span>
                  </div>
                  {prize.description && <p className="text-sm text-slate-500 mb-1">{prize.description}</p>}
                  {prize.stock !== null && (
                    <p className="text-xs text-slate-400">剩餘 {prize.stock} 件</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-black text-purple-600">{prize.points_cost}</p>
                  <p className="text-xs text-slate-400 mb-2">積分</p>
                  <button
                    onClick={() => handleRedeem(prize)}
                    disabled={outOfStock || redeeming === prize.id || (!session)}
                    className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                      outOfStock
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : canRedeem
                        ? 'bg-purple-500 text-white hover:bg-purple-600 active:scale-95'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {outOfStock ? '已售完' : redeeming === prize.id ? '處理中…' : '兌換'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button
        onClick={() => router.push('/')}
        className="mt-4 px-8 py-3 rounded-2xl border-2 border-slate-200 text-slate-600 font-semibold text-lg hover:bg-slate-50"
      >
        ← 返回首頁
      </button>
    </main>
  )
}
