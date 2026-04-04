'use client'

import { getEncouragement } from '@/lib/gameLogic'

interface SessionSummaryProps {
  accuracy: number
  modeName: string
}

export function SessionSummary({ accuracy, modeName }: SessionSummaryProps) {
  const encouragement = getEncouragement(accuracy)

  const accentColor =
    accuracy >= 80
      ? 'text-green-600'
      : accuracy >= 60
      ? 'text-blue-700'
      : 'text-amber-600'

  return (
    <div className="text-center">
      <div className="text-6xl mb-3 leading-none">
        {accuracy >= 80 ? '🏆' : accuracy >= 60 ? '⭐' : '💪'}
      </div>
      <div className={`text-7xl font-black tabular-nums leading-none ${accentColor}`}>
        {accuracy}
        <span className="text-4xl font-bold text-gray-400 ml-1">%</span>
      </div>
      <p className="text-lg text-gray-500 mt-2 font-medium">成功率</p>
      <p className={`text-2xl font-bold mt-3 ${accentColor}`}>{encouragement}</p>
      <p className="text-base text-gray-400 mt-1">訓練模式：{modeName}</p>
    </div>
  )
}
