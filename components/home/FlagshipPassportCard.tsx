'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FLAGSHIP_GAMES } from '@/lib/retentionAgent'
import {
  FLAGSHIP_UNLOCK_NAME,
  getFlagshipPassportProgress,
  readFlagshipPassport,
  type FlagshipPassportState,
} from '@/lib/flagshipUnlocks'

export default function FlagshipPassportCard() {
  const router = useRouter()
  const [state, setState] = useState<FlagshipPassportState>(() => ({
    stamps: [],
    unlocked: false,
    unlockedAt: null,
  }))

  useEffect(() => {
    setState(readFlagshipPassport())
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'lmx-flagship-passport-v1') {
        setState(readFlagshipPassport())
      }
    }
    const onPassport = () => setState(readFlagshipPassport())
    window.addEventListener('storage', onStorage)
    window.addEventListener('lmx:flagship-passport', onPassport)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('lmx:flagship-passport', onPassport)
    }
  }, [])

  const progress = getFlagshipPassportProgress(state)
  const nextGame = progress.remaining[0] ?? FLAGSHIP_GAMES[0]
  const percent = Math.round((progress.completedCount / progress.total) * 100)

  return (
    <section className="bg-white rounded-2xl shadow-sm p-4 border border-emerald-100" aria-labelledby="flagship-passport-title">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-3xl" aria-hidden>
          🏁
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase text-emerald-700">旗艦長期目標</p>
          <h2 id="flagship-passport-title" className="text-lg font-black text-slate-900">旗艦巡禮護照</h2>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
            四款旗艦各完成一局，就解鎖{FLAGSHIP_UNLOCK_NAME}。只看完成，不比高分。
          </p>
        </div>
        {state.unlocked && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-700">已解鎖</span>}
      </div>

      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100" aria-label={`旗艦巡禮進度 ${percent}%`}>
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {FLAGSHIP_GAMES.map((game) => {
          const done = progress.completed.some((completed) => completed.id === game.id)
          return (
            <button
              key={game.id}
              type="button"
              onClick={() => router.push(game.route)}
              className={`min-h-[58px] rounded-xl border px-3 py-2 text-left transition-transform active:scale-[0.98] ${
                done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-xl" aria-hidden>{done ? '✅' : game.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-black text-slate-800">{game.name}</span>
              </span>
              <span className={`mt-0.5 block text-[11px] font-bold ${done ? 'text-emerald-700' : 'text-slate-500'}`}>
                {done ? '已蓋章' : '完成一局蓋章'}
              </span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => router.push(nextGame.route)}
        className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white active:scale-[0.98]"
      >
        <span aria-hidden>{state.unlocked ? '🎏' : nextGame.emoji}</span>
        <span>{state.unlocked ? `${FLAGSHIP_UNLOCK_NAME}已掛上小鎮` : `下一站：${nextGame.name}`}</span>
      </button>
    </section>
  )
}
