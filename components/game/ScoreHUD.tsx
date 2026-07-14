'use client'

interface ScoreHUDProps {
  successCount: number
  totalCompleted: number
}

export function ScoreHUD({ successCount, totalCompleted }: ScoreHUDProps) {
  return (
    <div className="min-w-[4.5rem] text-center">
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-0.5">
        成功
      </div>
      <div className="text-3xl sm:text-4xl font-black leading-none">
        <span className="text-green-600 tabular-nums">{successCount}</span>
        <span className="text-slate-300 text-2xl mx-1">/</span>
        <span className="text-slate-500 text-2xl tabular-nums">{totalCompleted}</span>
      </div>
    </div>
  )
}
