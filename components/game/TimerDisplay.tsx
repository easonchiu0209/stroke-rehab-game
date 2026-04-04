'use client'

import { formatTime } from '@/lib/gameLogic'

interface TimerDisplayProps {
  seconds: number
}

export function TimerDisplay({ seconds }: TimerDisplayProps) {
  return (
    <div className="text-center">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
        計時
      </div>
      <div className="text-4xl font-mono font-bold text-gray-800 tabular-nums leading-none">
        {formatTime(seconds)}
      </div>
    </div>
  )
}
