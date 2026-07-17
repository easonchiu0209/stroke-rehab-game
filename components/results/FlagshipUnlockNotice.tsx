'use client'

import { useEffect, useState } from 'react'
import {
  FLAGSHIP_UNLOCK_NAME,
  getFlagshipPassportProgress,
  readFlagshipPassport,
  type FlagshipPassportState,
} from '@/lib/flagshipUnlocks'

export default function FlagshipUnlockNotice() {
  const [state, setState] = useState<FlagshipPassportState>(() => ({
    stamps: [],
    unlocked: false,
    unlockedAt: null,
  }))

  useEffect(() => {
    setState(readFlagshipPassport())
  }, [])

  const progress = getFlagshipPassportProgress(state)

  return (
    <div className="w-full max-w-sm rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left shadow-sm">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>{state.unlocked ? '🎏' : '🏁'}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-emerald-900">
            {state.unlocked ? `${FLAGSHIP_UNLOCK_NAME}已解鎖` : '旗艦巡禮已蓋章'}
          </p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-700">
            {state.unlocked
              ? '你已完成四款旗艦各一局，小鎮多了一面紀念旗。'
              : `目前 ${progress.completedCount}/${progress.total} 款旗艦完成，下一局可以試試 ${progress.remaining[0]?.name ?? '任一旗艦'}。`}
          </p>
        </div>
      </div>
    </div>
  )
}
