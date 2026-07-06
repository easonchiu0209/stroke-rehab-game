// DDA 難度自適應（AI 遊戲開發指引 L1 規格）— 純函式，前後端共用。
//
// 兩層機制：
// 1. 場末 performance_index：加權(完成率, 反應時間, 代償次數)，
//    連續 2 場 > 0.85 → 升一級；連續 2 場 < 0.5 → 降一級（1–3 級對應 easy/medium/hard）。
//    狀態存 dda_state 表，由 /api/game/save 更新；每次調整寫入 quality_metrics.dda_log 供治療師稽核。
// 2. 場中心流控制：滾動命中率維持 70–80% 甜蜜區（見 hooks/useFlowDda.ts）。
//
// 原則（法規安全線）：AI 只建議，開場難度由個案/治療師確認；未來處方系統上線後，
// 升降範圍受 prescriptions.difficulty_params 的上下限約束（TODO Phase 2）。

export type Difficulty = 'easy' | 'medium' | 'hard'

export const LEVEL_TO_DIFF: Record<number, Difficulty> = { 1: 'easy', 2: 'medium', 3: 'hard' }
export const DIFF_TO_LEVEL: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 }

export interface PerfInput {
  hits: number
  misses: number
  avgReactionMs?: number | null
  compensationCount?: number
}

/** 場末表現指數 0–1：完成率 50% + 反應時間 30% + 代償 20%（缺項時權重重分配） */
export function computePerformanceIndex({ hits, misses, avgReactionMs, compensationCount }: PerfInput): number | null {
  const attempts = hits + misses
  if (attempts < 5) return null   // 樣本太少不評分（避免誤觸升降級）

  const completion = hits / attempts

  // 反應：≤700ms 滿分，≥2200ms 零分，線性
  const reaction = avgReactionMs != null && avgReactionMs > 0
    ? Math.max(0, Math.min(1, (2200 - avgReactionMs) / 1500))
    : null

  // 代償：0 次滿分，≥6 次零分
  const comp = compensationCount != null
    ? Math.max(0, 1 - compensationCount / 6)
    : null

  let index: number
  if (reaction != null && comp != null) index = 0.5 * completion + 0.3 * reaction + 0.2 * comp
  else if (reaction != null)            index = 0.6 * completion + 0.4 * reaction
  else if (comp != null)                index = 0.75 * completion + 0.25 * comp
  else                                  index = completion

  return Math.round(index * 100) / 100
}

export interface DdaState {
  level: number        // 1–3
  streak_high: number
  streak_low: number
}

const UP_THRESHOLD = 0.85
const DOWN_THRESHOLD = 0.5
const STREAK_NEEDED = 2

/** 升降級狀態機：回傳新狀態與變化量（-1/0/+1） */
export function nextDdaState(state: DdaState, index: number): DdaState & { change: -1 | 0 | 1 } {
  let { level, streak_high, streak_low } = state
  let change: -1 | 0 | 1 = 0

  if (index > UP_THRESHOLD) {
    streak_high += 1
    streak_low = 0
    if (streak_high >= STREAK_NEEDED && level < 3) {
      level += 1; change = 1; streak_high = 0
    }
  } else if (index < DOWN_THRESHOLD) {
    streak_low += 1
    streak_high = 0
    if (streak_low >= STREAK_NEEDED && level > 1) {
      level -= 1; change = -1; streak_low = 0
    }
  } else {
    streak_high = 0
    streak_low = 0
  }

  return { level, streak_high, streak_low, change }
}
