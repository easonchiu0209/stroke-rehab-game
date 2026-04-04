'use client'

import { ROUND_COUNT_OPTIONS } from '@/lib/constants'

interface RoundCountSelectorProps {
  selected: number
  onSelect: (count: number) => void
}

export function RoundCountSelector({ selected, onSelect }: RoundCountSelectorProps) {
  return (
    <div className="flex gap-3 justify-center">
      {ROUND_COUNT_OPTIONS.map((count) => (
        <button
          key={count}
          onClick={() => onSelect(count)}
          className={`
            flex-1 max-w-[80px]
            h-[72px] text-2xl font-bold
            rounded-2xl border-2 transition-all duration-150
            active:scale-[0.95] no-select
            ${selected === count
              ? 'bg-blue-800 text-white border-blue-800 shadow-md shadow-blue-200'
              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-700'
            }
          `}
        >
          {count}
        </button>
      ))}
    </div>
  )
}
