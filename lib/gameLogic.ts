import type {
  GameMode, GameConfig, GameSession, RoundState,
  SessionStats, Task,
} from '@/types/game'
import { NEAR_TASKS, LATERAL_TASKS } from './constants'

// ── Task Generation ───────────────────────────────────────────

/**
 * Generate a task for the given mode.
 * Avoids repeating the same position as the last task when possible.
 */
export function generateTask(mode: GameMode, lastTask?: Task): Task {
  const pool = mode === 'near-reach' ? NEAR_TASKS : LATERAL_TASKS

  if (pool.length <= 1) return pool[0]

  // Filter out same position as last to avoid consecutive repeats
  const candidates = lastTask
    ? pool.filter((t) => t.position !== lastTask.position)
    : pool

  const source = candidates.length > 0 ? candidates : pool
  return source[Math.floor(Math.random() * source.length)]
}

// ── Session Lifecycle ─────────────────────────────────────────

export function createSession(config: GameConfig): GameSession {
  const firstTask = generateTask(config.mode)
  return {
    mode: config.mode,
    totalRounds: config.totalRounds,
    rounds: [
      {
        roundNumber: 1,
        task: firstTask,
        startTime: Date.now(),
        endTime: null,
        result: null,
      },
    ],
    sessionStart: Date.now(),
    sessionEnd: null,
  }
}

export function recordRoundResult(
  session: GameSession,
  roundIndex: number,
  result: 'success' | 'fail'
): GameSession {
  const rounds = session.rounds.map((r, i) =>
    i === roundIndex
      ? { ...r, result, endTime: Date.now() }
      : r
  ) as RoundState[]

  return { ...session, rounds }
}

export function advanceToNextRound(session: GameSession): GameSession {
  const lastTask = session.rounds[session.rounds.length - 1]?.task
  const nextTask = generateTask(session.mode, lastTask)
  const nextRound: RoundState = {
    roundNumber: session.rounds.length + 1,
    task: nextTask,
    startTime: Date.now(),
    endTime: null,
    result: null,
  }
  return { ...session, rounds: [...session.rounds, nextRound] }
}

// ── Stats Computation ─────────────────────────────────────────

export function computeStats(session: GameSession): SessionStats {
  const completed = session.rounds.filter((r) => r.result !== null)
  const successCount = completed.filter((r) => r.result === 'success').length
  const failCount = completed.filter((r) => r.result === 'fail').length
  const accuracy =
    completed.length > 0
      ? Math.round((successCount / completed.length) * 100)
      : 0
  const totalDuration = session.sessionEnd
    ? session.sessionEnd - session.sessionStart
    : 0

  const roundDurations = completed
    .filter((r) => r.endTime !== null)
    .map((r) => r.endTime! - r.startTime)

  const avgRoundDuration =
    roundDurations.length > 0
      ? Math.round(roundDurations.reduce((a, b) => a + b, 0) / roundDurations.length)
      : 0

  return { successCount, failCount, accuracy, totalDuration, avgRoundDuration }
}

// ── Formatting ────────────────────────────────────────────────

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function formatMs(ms: number): string {
  return formatTime(Math.round(ms / 1000))
}

export function getEncouragement(accuracy: number): string {
  if (accuracy >= 90) return '太棒了！表現非常出色！🏆'
  if (accuracy >= 75) return '做得很好！繼續保持！⭐'
  if (accuracy >= 60) return '不錯！再接再厲！👍'
  if (accuracy >= 40) return '有進步！繼續努力！💪'
  return '很好的嘗試！每次練習都有幫助！🌱'
}
