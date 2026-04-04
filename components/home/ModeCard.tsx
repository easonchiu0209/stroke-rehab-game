'use client'

import type { GameMode } from '@/types/game'
import { MODE_LABELS, MODE_DESCRIPTIONS, MODE_ICONS, MODE_COLORS } from '@/lib/constants'

interface ModeCardProps {
  mode: GameMode
  selected: boolean
  onSelect: () => void
}

export function ModeCard({ mode, selected, onSelect }: ModeCardProps) {
  const colors = MODE_COLORS[mode]

  return (
    <button
      onClick={onSelect}
      className={`
        flex-1 text-left
        rounded-2xl border-4 p-5
        transition-all duration-150
        min-h-[140px]
        active:scale-[0.97]
        no-select
        ${selected
          ? `${colors.bg} ${colors.border} shadow-md`
          : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }
      `}
    >
      <div className="text-4xl mb-2 leading-none">{MODE_ICONS[mode]}</div>
      <div
        className={`text-xl font-bold mb-1 ${selected ? colors.text : 'text-gray-800'}`}
      >
        {MODE_LABELS[mode]}
      </div>
      <div className={`text-base ${selected ? colors.text : 'text-gray-500'}`}>
        {MODE_DESCRIPTIONS[mode]}
      </div>

      {selected && (
        <div className={`mt-3 text-sm font-semibold ${colors.text} flex items-center gap-1`}>
          <span className="text-lg">✓</span> 已選擇
        </div>
      )}
    </button>
  )
}
