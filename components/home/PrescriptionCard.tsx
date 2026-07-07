'use client'

// 首頁「今日處方」卡：治療師開立的訓練處方＋本週完成進度。
// 顯示優先於每日任務（處方是臨床指示）。無處方或未登入時不佔版面。

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GAME_INFO, DIFF_LABELS } from '@/lib/gameInfo'

interface Rx {
  id: string
  game_type: string
  difficulty_params: { difficulty?: string } | null
  sessions_per_week: number
  week_done: number
  note: string | null
}

export default function PrescriptionCard() {
  const router = useRouter()
  const [rxs, setRxs] = useState<Rx[] | null>(null)

  useEffect(() => {
    fetch('/api/prescriptions')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.prescriptions?.length) setRxs(d.prescriptions) })
      .catch(() => { /* 未登入：不顯示 */ })
  }, [])

  if (!rxs) return null

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl shadow-sm p-4 border border-emerald-200">
      <div className="flex items-center justify-between mb-3">
        <p className="font-extrabold text-emerald-900">🩺 治療師的訓練處方</p>
        <span className="text-xs font-bold text-emerald-500">本週進度</span>
      </div>
      <div className="flex flex-col gap-2">
        {rxs.map(rx => {
          const info = GAME_INFO[rx.game_type]
          const diff = rx.difficulty_params?.difficulty ?? 'easy'
          const done = rx.week_done >= rx.sessions_per_week
          return (
            <div key={rx.id} className={`flex items-center gap-3 rounded-xl border p-3 ${done ? 'border-emerald-200 bg-emerald-50/70' : 'border-white bg-white'}`}>
              <span className="text-2xl shrink-0">{info?.emoji ?? '🎮'}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${done ? 'text-emerald-700' : 'text-slate-800'}`}>
                  {info?.name ?? rx.game_type}
                  <span className="ml-1.5 text-xs font-semibold text-slate-400">{DIFF_LABELS[diff] ?? diff}</span>
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {/* 打勾進度 */}
                  <div className="flex gap-1">
                    {Array.from({ length: rx.sessions_per_week }).map((_, i) => (
                      <span key={i} className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${
                        i < rx.week_done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
                      }`}>{i < rx.week_done ? '✓' : ''}</span>
                    ))}
                  </div>
                  <span className="text-xs text-slate-400 font-semibold">{rx.week_done}/{rx.sessions_per_week} 次</span>
                </div>
                {rx.note && <p className="text-xs text-slate-400 mt-1">💬 {rx.note}</p>}
              </div>
              {done ? (
                <span className="text-emerald-600 text-sm font-bold shrink-0">本週達標 🎉</span>
              ) : info ? (
                <button onClick={() => router.push(info.route)}
                  className="px-3 py-1.5 rounded-full bg-emerald-600 text-white text-sm font-bold active:scale-95 shrink-0">
                  去訓練
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
