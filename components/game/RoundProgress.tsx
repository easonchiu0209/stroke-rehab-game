'use client'

interface RoundProgressProps {
  current: number  // 1-based
  total: number
  rounds: Array<{ result: 'success' | 'fail' | null }>
}

export function RoundProgress({ current, total, rounds }: RoundProgressProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xl font-bold text-gray-800">
        第 <span className="text-blue-800 text-2xl">{current}</span> 回合
        <span className="text-gray-400 text-lg font-normal"> / 共 {total} 回合</span>
      </div>

      {/* Round indicators */}
      <div className="flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => {
          const round = rounds[i]
          const result = round?.result

          let classes = 'w-4 h-4 rounded-full transition-all duration-200 '
          if (result === 'success') {
            classes += 'bg-green-500'
          } else if (result === 'fail') {
            classes += 'bg-red-400'
          } else if (i === current - 1) {
            classes += 'bg-blue-800 ring-2 ring-blue-300 ring-offset-1'
          } else {
            classes += 'bg-gray-200'
          }

          return <div key={i} className={classes} />
        })}
      </div>
    </div>
  )
}
