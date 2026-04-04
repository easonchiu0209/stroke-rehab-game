'use client'

interface ScoreHUDProps {
  successCount: number
  totalCompleted: number
}

export function ScoreHUD({ successCount, totalCompleted }: ScoreHUDProps) {
  return (
    <div className="text-center">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
        成功
      </div>
      <div className="text-4xl font-bold leading-none">
        <span className="text-green-600 tabular-nums">{successCount}</span>
        <span className="text-gray-300 text-2xl mx-1">/</span>
        <span className="text-gray-500 text-2xl tabular-nums">{totalCompleted}</span>
      </div>
    </div>
  )
}
