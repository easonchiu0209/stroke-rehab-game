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
  const readyCount = quests.filter(q => !q.claimed && q.progress >= q.target).length
  const progressPercent = Math.round((doneCount / quests.length) * 100)

  return (
    <section className="bg-white rounded-2xl shadow-sm overflow-hidden border border-amber-100" aria-labelledby="daily-adventure-title">
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-4 border-b border-amber-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-amber-700">每日 10 分鐘</p>
            <h2 id="daily-adventure-title" className="font-extrabold text-slate-900">🗺️ 今日冒險路線</h2>
          </div>
          <span className="text-xs font-black text-amber-700 bg-white rounded-full px-3 py-1.5 shadow-sm">
            {doneCount}/{quests.length} 關
          </span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white shadow-inner" aria-label={`冒險進度 ${progressPercent}%`}>
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="px-4">
        {quests.map((q, index) => {
          const done = q.progress >= q.target
          return (
            <div key={q.id}
              className={`relative flex min-h-[78px] items-center gap-3 border-b py-3 last:border-b-0 ${
                q.claimed ? 'border-green-100' : 'border-slate-100'
              }`}
            >
              <div className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-xl shadow-sm ${
                q.claimed
                  ? 'border-green-400 bg-green-100'
                  : done
                    ? 'border-amber-400 bg-amber-100'
                    : 'border-slate-200 bg-slate-50'
              }`}>
                {q.claimed ? '✓' : q.emoji}
              </div>
              {index < quests.length - 1 && <span className="absolute bottom-[-14px] left-[21px] top-[56px] w-0.5 bg-slate-200" aria-hidden />}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-slate-400">第 {index + 1} 關</p>
                <p className={`text-sm font-bold ${q.claimed ? 'text-green-700' : 'text-slate-800'}`}>{q.title}</p>
                <p className="text-xs text-slate-500 font-semibold">
                  進度 {q.progress}/{q.target} · 獎勵 🪙{q.reward.coins}{q.reward.pearls > 0 && ` 🫧${q.reward.pearls}`}
                </p>
              </div>
              {q.claimed ? (
                <span className="text-green-700 text-xs font-black shrink-0">已收入</span>
              ) : done ? (
                <button onClick={() => claim(q)} disabled={claiming === q.id}
                  className="min-h-11 px-3 py-1.5 rounded-full bg-amber-500 text-white text-sm font-bold shadow active:scale-95 disabled:opacity-50 shrink-0">
                  {claiming === q.id ? '…' : '領取'}
                </button>
              ) : q.route ? (
                <button onClick={() => router.push(q.route!)}
                  className="min-h-11 px-3 py-1.5 rounded-full bg-blue-600 text-white text-sm font-bold shadow active:scale-95 shrink-0">
                  出發
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className={`mx-4 mb-4 flex items-center gap-3 rounded-xl px-4 py-3 ${
        doneCount === quests.length ? 'bg-green-100 text-green-900' : readyCount > 0 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'
      }`}>
        <span className="text-3xl">{doneCount === quests.length ? '🎁' : '🔒'}</span>
        <div className="min-w-0">
          <p className="text-sm font-extrabold">
            {doneCount === quests.length ? '今日寶箱已開啟！' : readyCount > 0 ? '有獎勵可以領取' : `再完成 ${quests.length - doneCount} 關開啟寶箱`}
          </p>
          <p className="text-xs font-semibold opacity-75">
            {doneCount === quests.length ? '金幣與珍珠已送進你的家園' : '每一關都會帶回養成資源'}
          </p>
        </div>
      </div>
    </section>
  )
}
