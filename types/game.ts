export type GameMode = 'near-reach' | 'lateral'
export type TaskPosition = 'center' | 'left' | 'right'
export type RoundResult = 'success' | 'fail' | null
export type RoundPhase = 'waiting' | 'showing-feedback' | 'transitioning'

export interface Task {
  position: TaskPosition
  instruction: string
  colorClass: string  // Tailwind classes for bg + border, e.g. 'bg-blue-100 border-blue-500'
  labelColor: string  // e.g. 'text-blue-800'
  emoji: string
}

export interface RoundState {
  roundNumber: number
  task: Task
  startTime: number
  endTime: number | null
  result: RoundResult
}

export interface GameConfig {
  mode: GameMode
  totalRounds: number
}

export interface GameSession {
  mode: GameMode
  totalRounds: number
  rounds: RoundState[]
  sessionStart: number
  sessionEnd: number | null
}

export interface SessionStats {
  successCount: number
  failCount: number
  accuracy: number         // 0-100 integer
  totalDuration: number    // ms
  avgRoundDuration: number // ms, only for completed rounds
}

export interface GameState {
  config: GameConfig | null
  session: GameSession | null
  currentRoundIndex: number
  roundPhase: RoundPhase
  stats: SessionStats | null
  elapsedSeconds: number
}

export type GameAction =
  | { type: 'START_GAME'; payload: GameConfig }
  | { type: 'RECORD_RESULT'; payload: 'success' | 'fail' }
  | { type: 'ADVANCE_ROUND' }
  | { type: 'END_GAME' }
  | { type: 'RESET' }
  | { type: 'TICK_TIMER' }
