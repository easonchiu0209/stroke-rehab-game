'use client'

import type { Task } from '@/types/game'

// Map position/task to a simple left-border color that won't conflict with Tailwind purging
const BORDER_COLOR_MAP: Record<string, string> = {
  'bg-blue-100 border-blue-500': 'border-l-blue-500',
  'bg-sky-100 border-sky-500': 'border-l-sky-500',
  'bg-teal-100 border-teal-500': 'border-l-teal-500',
  'bg-cyan-100 border-cyan-500': 'border-l-cyan-500',
  'bg-orange-100 border-orange-500': 'border-l-orange-500',
  'bg-purple-100 border-purple-500': 'border-l-purple-500',
  'bg-amber-100 border-amber-500': 'border-l-amber-500',
  'bg-violet-100 border-violet-500': 'border-l-violet-500',
}

interface TaskPromptProps {
  task: Task
  roundNumber: number
}

export function TaskPrompt({ task, roundNumber }: TaskPromptProps) {
  const borderColor = BORDER_COLOR_MAP[task.colorClass] ?? 'border-l-blue-500'

  return (
    <div
      className={`
        w-full max-w-3xl mx-auto
        game-card rounded-2xl
        border-l-8 ${borderColor}
        px-5 py-4 sm:px-6 sm:py-5
      `}
    >
      <div className="text-sm font-bold text-slate-500 mb-1 uppercase tracking-wide">
        第 {roundNumber} 回合任務
      </div>
      <div className="flex items-center gap-3">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/80 text-4xl shadow-inner soft-highlight">{task.emoji}</span>
        <p className={`text-2xl sm:text-3xl font-black ${task.labelColor} leading-tight`}>
          {task.instruction}
        </p>
      </div>
    </div>
  )
}
