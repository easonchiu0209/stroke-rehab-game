'use client'

// 首頁「本月全勤挑戰」卡：X/20 天進度條＋達成徽章。過期不補、已獲得永久保留。
// 未登入或無資料時不佔版面。

import { useEffect, useState } from 'react'

interface Progress {
  month: string
  days: number
  target: number
  earned: boolean
  badges: { month: string; days_trained: number }[]
}

export default function MonthlyBadgeCard() {
  const [p, setP] = useState<Progress | null>(null)

  useEffect(() => {
    fetch('/api/monthly-badge')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.progress) setP(d.progress) })
      .catch(() => { /* 未登入：不顯示 */ })
  }, [])

  if (!p || (p.days === 0 && p.badges.length === 0)) return null

  const pct = Math.min(100, Math.round((p.days / p.target) * 100))
  const monthNum = Number(p.month.slice(5, 7))

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="font-extrabold text-slate-800">🏅 本月全勤挑戰</p>
        <span className={`text-xs font-bold ${p.earned ? 'text-amber-600' : 'text-slate-400'}`}>
          {p.earned ? `${monthNum} 月徽章 GET！` : `${p.days}/${p.target} 天`}
        </span>
      </div>
      {/* 進度條 */}
      <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${p.earned ? 'bg-gradient-to-r from-amber-400 to-yellow-400' : 'bg-gradient-to-r from-sky-400 to-blue-400'}`}
          style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-slate-400 mt-1.5">
        {p.earned ? '這個月的限定徽章已到手，繼續保持！' : `當月訓練滿 ${p.target} 天可獲得 ${monthNum} 月限定徽章（過期不補）`}
      </p>
      {/* 徽章牆（歷史） */}
      {p.badges.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mt-2">
          {p.badges.map(b => (
            <span key={b.month} title={`訓練 ${b.days_trained} 天`}
              className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
              🏅 {Number(b.month.slice(5, 7))} 月
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
