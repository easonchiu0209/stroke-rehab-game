'use client'

// 首頁「今日任務」三格卡（留存三件套之三）。
// 任務每日輪替（指定遊戲優先曝光冷門遊戲），完成領農場金幣/珍珠。
// 未登入或 API 未就緒時不佔版面。

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Quest {
  id: string
  title: string
  emoji: string
  target: number
  progress: number
  claimed: boolean
  reward: { coins: number; pearls: number }
  route?: string
}

export default function DailyQuestCard() {
  const router = useRouter()
  const [quests, setQuests] = useState<Quest[] | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/quests')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.quests) setQuests(d.quests) })
      .catch(() => { /* 未登入/表未建：不顯示 */ })
  }, [])
  useEffect(() => { load() }, [load])

  if (!quests) return null

  async function claim(q: Quest) {
    setClaiming(q.id)
    try {
      const res = await fetch('/api/quests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quest_id: q.id }),
      })
      if (res.ok) {
        const d = await res.json()
        window.dispatchEvent(new CustomEvent('lmx:drop', {
          detail: { coins: d.reward.coins, pearls: d.reward.pearls, rare: false },
        }))
        load()
      } else {
        const d = await res.json().catch(() => null)
        alert(d?.error ?? '領取失敗，請稍後再試')
      }
    } finally {
      setClaiming(null)
    }
  }

  const doneCount = quests.filter(q => q.claimed).length

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="font-extrabold text-slate-800">📋 今日任務</p>
        <span className="text-xs font-bold text-slate-400">{doneCount}/{quests.length} 完成</span>
      </div>
      <div className="flex flex-col gap-2">
        {quests.map(q => {
          const done = q.progress >= q.target
          return (
            <div key={q.id}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                q.claimed ? 'border-green-100 bg-green-50/60' : done ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'
              }`}
            >
              <span className="text-2xl shrink-0">{q.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${q.claimed ? 'text-green-700 line-through' : 'text-slate-800'}`}>{q.title}</p>
                <p className="text-xs text-slate-400 font-semibold">
                  {q.progress}/{q.target}　獎勵 🪙{q.reward.coins}{q.reward.pearls > 0 && ` 🫧${q.reward.pearls}`}
                </p>
              </div>
              {q.claimed ? (
                <span className="text-green-600 text-xl">✓</span>
              ) : done ? (
                <button onClick={() => claim(q)} disabled={claiming === q.id}
                  className="px-3 py-1.5 rounded-full bg-amber-500 text-white text-sm font-bold active:scale-95 disabled:opacity-50">
                  {claiming === q.id ? '…' : '領取'}
                </button>
              ) : q.route ? (
                <button onClick={() => router.push(q.route!)}
                  className="px-3 py-1.5 rounded-full bg-blue-500 text-white text-sm font-bold active:scale-95">
                  去玩
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
