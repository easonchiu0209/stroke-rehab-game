'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface LeaderEntry {
  id:           string
  display_name: string
  picture_url:  string | null
  total_points: number
}

export default function LeaderboardPage() {
  const router = useRouter()
  const [list, setList]       = useState<LeaderEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(data => { setList(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const medals = ['🥇', '🥈', '🥉']

  return (
    <main className="min-h-screen bg-gradient-to-b from-yellow-50 to-orange-50 flex flex-col items-center px-5 py-10 gap-6">
      <div className="text-center">
        <div className="text-6xl mb-2">🏆</div>
        <h1 className="text-4xl font-extrabold text-gray-900">排行榜</h1>
        <p className="text-gray-500 mt-1">依累計積分排名</p>
      </div>

      <div className="w-full max-w-lg">
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-xl animate-pulse">載入中…</div>
        ) : list.length === 0 ? (
          <div className="text-center py-16 text-gray-400">尚無資料，快去玩遊戲累積積分吧！</div>
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((entry, idx) => (
              <div
                key={entry.id}
                className={`flex items-center gap-4 p-4 rounded-2xl shadow-sm border ${
                  idx === 0 ? 'bg-yellow-100 border-yellow-300' :
                  idx === 1 ? 'bg-gray-100 border-gray-300' :
                  idx === 2 ? 'bg-orange-100 border-orange-300' :
                  'bg-white border-gray-200'
                }`}
              >
                <div className="text-3xl w-10 text-center font-black">
                  {idx < 3 ? medals[idx] : <span className="text-xl text-gray-400">{idx + 1}</span>}
                </div>
                <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 shrink-0">
                  {entry.picture_url
                    ? <img src={entry.picture_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-2xl">🙂</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate">{entry.display_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-orange-600">{entry.total_points.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">積分</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => router.push('/')}
        className="mt-4 px-8 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg hover:bg-gray-50"
      >
        ← 返回首頁
      </button>
    </main>
  )
}
