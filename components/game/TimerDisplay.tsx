'use client'

import { formatTime } from '@/lib/gameLogic'

interface TimerDisplayProps {
  seconds: number
}

export function TimerDisplay({ seconds }: TimerDisplayProps) {
  return (
    <div className="order-1 min-w-[5.25rem] text-center sm:order-none">
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-0.5">
        計時
      </div>
      <div className="text-3xl sm:text-4xl font-mono font-black text-slate-900 tabular-nums leading-none">
        {formatTime(seconds)}
      </div>
    </div>
  )
}
