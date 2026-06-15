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

export default function PrizesPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [prizes,    setPrizes]    = useState<Prize[]>([])
  const [loading,   setLoading]   = useState(true)
  const [redeeming, setRedeeming] = useState<string | null>(null)
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/prizes')
      .then(r => r.json())
      .then(data => { setPrizes(data); setLoading(false) })
  }, [])

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const handleRedeem = async (prize: Prize) => {
    if (!session) { signIn('line'); return }
    if (session.user.totalPoints < prize.points_cost) {
      showToast(`積分不足（需要 ${prize.points_cost}，你有 ${session.user.totalPoints}）`, false)
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
        router.refresh()
      } else {
        showToast(data.error ?? '兌換失敗', false)
      }
    } finally {
      setRedeeming(null)
    }
  }

  const userPoints = session?.user.totalPoints ?? 0

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
        <h1 className="text-4xl font-extrabold text-gray-900">兌換獎品</h1>
        {session
          ? <p className="text-purple-700 font-bold mt-1 text-xl">你有 {userPoints.toLocaleString()} 積分</p>
          : <p className="text-gray-500 mt-1">登入後可兌換獎品</p>
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

      {loading ? (
        <div className="text-center py-16 text-gray-400 animate-pulse text-xl">載入獎品中…</div>
      ) : (
        <div className="w-full max-w-lg grid grid-cols-1 gap-4">
          {prizes.map(prize => {
            const canRedeem = session && userPoints >= prize.points_cost
            const outOfStock = prize.stock !== null && prize.stock <= 0
            return (
              <div key={prize.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex gap-4 items-center">
                <div className="text-5xl shrink-0">{prize.image_emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-bold text-gray-900">{prize.name}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                      {CATEGORY_LABELS[prize.category] ?? prize.category}
                    </span>
                  </div>
                  {prize.description && <p className="text-sm text-gray-500 mb-1">{prize.description}</p>}
                  {prize.stock !== null && (
                    <p className="text-xs text-gray-400">剩餘 {prize.stock} 件</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-black text-purple-600">{prize.points_cost}</p>
                  <p className="text-xs text-gray-400 mb-2">積分</p>
                  <button
                    onClick={() => handleRedeem(prize)}
                    disabled={outOfStock || redeeming === prize.id || (!session)}
                    className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                      outOfStock
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : canRedeem
                        ? 'bg-purple-500 text-white hover:bg-purple-600 active:scale-95'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
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
        className="mt-4 px-8 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg hover:bg-gray-50"
      >
        ← 返回首頁
      </button>
    </main>
  )
}
