'use client'

interface RoundProgressProps {
  current: number  // 1-based
  total: number
  rounds: Array<{ result: 'success' | 'fail' | null }>
}

export function RoundProgress({ current, total, rounds }: RoundProgressProps) {
  return (
    <div className="order-3 flex min-w-0 basis-full flex-col items-center gap-2 sm:order-none sm:basis-auto">
      <div className="text-base sm:text-xl font-black text-slate-800 whitespace-nowrap">
        第 <span className="text-blue-800 text-2xl">{current}</span> 回合
        <span className="text-gray-400 text-lg font-normal"> / 共 {total} 回合</span>
      </div>

      {/* Round indicators */}
      <div className="flex max-w-full gap-1.5 overflow-hidden rounded-full bg-white/55 px-2 py-1 shadow-inner">
        {Array.from({ length: total }).map((_, i) => {
          const round = rounds[i]
          const result = round?.result

          let classes = 'h-3.5 w-3.5 sm:w-4 sm:h-4 rounded-full transition-all duration-200 '
          if (result === 'success') {
            classes += 'bg-green-500 shadow-sm shadow-green-200'
          } else if (result === 'fail') {
            classes += 'bg-red-400 shadow-sm shadow-red-200'
          } else if (i === current - 1) {
            classes += 'bg-blue-700 ring-2 ring-blue-300 ring-offset-1 ring-offset-white scale-110'
          } else {
            classes += 'bg-slate-200'
          }

          return <div key={i} className={classes} />
        })}
      </div>
    </div>
  )
}
