import type { GameMode, Task } from '@/types/game'

export const ROUND_COUNT_OPTIONS = [3, 5, 8, 10] as const
export const DEFAULT_ROUND_COUNT = 5
export const FEEDBACK_DURATION_MS = 600
export const MAX_STORED_SESSIONS = 10
export const STORAGE_KEY = 'stroke-rehab-sessions'

// ── 近距離抓取放置 (near-reach) ──────────────────────────────
export const NEAR_TASKS: Task[] = [
  {
    position: 'center',
    instruction: '把物件放到正前方',
    colorClass: 'bg-blue-100 border-blue-500',
    labelColor: 'text-blue-800',
    emoji: '🎯',
  },
  {
    position: 'center',
    instruction: '把物件放到桌上中間',
    colorClass: 'bg-sky-100 border-sky-500',
    labelColor: 'text-sky-800',
    emoji: '📦',
  },
  {
    position: 'center',
    instruction: '伸手拿取並放下物件',
    colorClass: 'bg-teal-100 border-teal-500',
    labelColor: 'text-teal-800',
    emoji: '🤲',
  },
  {
    position: 'center',
    instruction: '慢慢把物件放到指定位置',
    colorClass: 'bg-cyan-100 border-cyan-500',
    labelColor: 'text-cyan-800',
    emoji: '✋',
  },
]

// ── 左右移動放置 (lateral) ────────────────────────────────────
export const LATERAL_TASKS: Task[] = [
  {
    position: 'left',
    instruction: '把物件放到左邊',
    colorClass: 'bg-orange-100 border-orange-500',
    labelColor: 'text-orange-800',
    emoji: '⬅️',
  },
  {
    position: 'right',
    instruction: '把物件放到右邊',
    colorClass: 'bg-purple-100 border-purple-500',
    labelColor: 'text-purple-800',
    emoji: '➡️',
  },
  {
    position: 'center',
    instruction: '把物件放到中間',
    colorClass: 'bg-blue-100 border-blue-500',
    labelColor: 'text-blue-800',
    emoji: '⬆️',
  },
  {
    position: 'left',
    instruction: '移動到左側區域',
    colorClass: 'bg-amber-100 border-amber-500',
    labelColor: 'text-amber-800',
    emoji: '↖️',
  },
  {
    position: 'right',
    instruction: '移動到右側區域',
    colorClass: 'bg-violet-100 border-violet-500',
    labelColor: 'text-violet-800',
    emoji: '↗️',
  },
]

export const MODE_LABELS: Record<GameMode, string> = {
  'near-reach': '近距離抓取放置',
  'lateral':    '左右移動放置',
}

export const MODE_DESCRIPTIONS: Record<GameMode, string> = {
  'near-reach': '練習伸手、抓握、放開動作',
  'lateral':    '練習跨越中線、肩膀及手肘控制',
}

export const MODE_ICONS: Record<GameMode, string> = {
  'near-reach': '🎯',
  'lateral':    '↔️',
}

export const MODE_COLORS: Record<GameMode, { bg: string; border: string; text: string }> = {
  'near-reach': { bg: 'bg-blue-50', border: 'border-blue-600', text: 'text-blue-800' },
  'lateral':    { bg: 'bg-indigo-50', border: 'border-indigo-600', text: 'text-indigo-800' },
}
