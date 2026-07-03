'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface LeaderEntry {
  id:           string
  display_name: string
  picture_url:  string | null
  total_points: number
}

interface WinnerEntry extends LeaderEntry { rank: number; reward: number }

interface LbData {
  updatedAt:   string
  nextUpdate:  string
  weekStart:   string
  allTime:     LeaderEntry[]
  weekly:      LeaderEntry[]
  lastWeekTop: WinnerEntry[]
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

export default function LeaderboardPage() {
  const router = useRouter()
  const [data, setData]       = useState<LbData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState<'all' | 'week'>('all')

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const medals = ['🥇', '🥈', '🥉']
  const list = tab === 'all' ? (data?.allTime ?? []) : (data?.weekly ?? [])

  return (
    <main className="min-h-screen bg-gradient-to-b from-yellow-50 to-orange-50 flex flex-col items-center px-5 py-10 gap-5">
      <div className="text-center">
        <div className="text-6xl mb-2">🏆</div>
        <h1 className="text-4xl font-extrabold text-gray-900">排行榜</h1>
      </div>

      {/* 分頁 */}
      <div className="flex gap-2 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100">
        {([['all', '總排行榜'], ['week', '本週排行榜']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-5 py-2 rounded-xl font-bold text-sm transition-all ${
              tab === k ? 'bg-orange-500 text-white shadow' : 'text-gray-500'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* 更新公告 */}
      {data && (
        <div className="w-full max-w-lg bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800">
          {tab === 'all' ? (
            <>📢 總排行榜每天 <b>12:00</b> 與 <b>00:00</b> 更新一次。<br />
              <span className="text-amber-600 text-xs">目前資料截至 {fmt(data.updatedAt)}　|　下次更新 {fmt(data.nextUpdate)}</span></>
          ) : (
            <>🗓 本週排行榜每週一 <b>00:00</b> 結算重來，計算本週新賺得的積分。<br />
              <span className="text-amber-600 text-xs">本週起算 {fmt(data.weekStart)}　|　資料截至 {fmt(data.updatedAt)}</span></>
          )}
        </div>
      )}

      {/* 上週冠軍（週榜分頁） */}
      {tab === 'week' && data && data.lastWeekTop.length > 0 && (
        <div className="w-full max-w-lg bg-white rounded-2xl border border-yellow-200 p-4 shadow-sm">
          <p className="font-bold text-gray-800 mb-2">👑 上週前三名（已自動發獎）</p>
          <div className="flex flex-col gap-1.5">
            {data.lastWeekTop.map((e, i) => (
              <div key={e.id} className="flex items-center gap-3 text-sm">
                <span className="text-lg w-6 text-center">{medals[i]}</span>
                <span className="flex-1 font-semibold text-gray-700 truncate">{e.display_name}</span>
                <span className="text-gray-400">{e.total_points} 分</span>
                <span className="font-bold text-green-600">🎁 +{e.reward}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="w-full max-w-lg">
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-xl animate-pulse">載入中…</div>
        ) : list.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            {tab === 'week' ? '本週還沒有人得分，快來搶頭香！' : '尚無資料，快去玩遊戲累積積分吧！'}
          </div>
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
                  <p className="text-xs text-gray-400">{tab === 'week' ? '本週積分' : '積分'}</p>
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
