'use client'

import { createContext, useContext, useReducer, type Dispatch } from 'react'
import type { GameState, GameAction, GameConfig } from '@/types/game'
import {
  createSession,
  recordRoundResult,
  advanceToNextRound,
  computeStats,
} from '@/lib/gameLogic'
import { saveSession } from '@/lib/storage'

// ── Initial State ────────────────────────────────────────────

const initialState: GameState = {
  config: null,
  session: null,
  currentRoundIndex: 0,
  roundPhase: 'waiting',
  stats: null,
  elapsedSeconds: 0,
}

// ── Reducer ──────────────────────────────────────────────────

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME': {
      const config: GameConfig = action.payload
      const session = createSession(config)
      return {
        ...initialState,
        config,
        session,
        roundPhase: 'waiting',
      }
    }

    case 'RECORD_RESULT': {
      if (!state.session) return state
      const updatedSession = recordRoundResult(
        state.session,
        state.currentRoundIndex,
        action.payload
      )
      return {
        ...state,
        session: updatedSession,
        roundPhase: 'showing-feedback',
      }
    }

    case 'ADVANCE_ROUND': {
      if (!state.session) return state
      const isLastRound =
        state.currentRoundIndex >= state.session.totalRounds - 1
      if (isLastRound) {
        // Signal that we should call END_GAME; don't end here directly
        return { ...state, roundPhase: 'transitioning' }
      }
      const updatedSession = advanceToNextRound(state.session)
      return {
        ...state,
        session: updatedSession,
        currentRoundIndex: state.currentRoundIndex + 1,
        roundPhase: 'waiting',
        elapsedSeconds: 0,
      }
    }

    case 'END_GAME': {
      if (!state.session) return state
      const endedSession = {
        ...state.session,
        sessionEnd: Date.now(),
      }
      const stats = computeStats(endedSession)
      // Save to localStorage as side effect inside reducer
      // (acceptable for MVP; avoids complex useEffect timing)
      saveSession(endedSession)
      return {
        ...state,
        session: endedSession,
        stats,
        roundPhase: 'transitioning',
      }
    }

    case 'TICK_TIMER':
      return { ...state, elapsedSeconds: state.elapsedSeconds + 1 }

    case 'RESET':
      return initialState

    default:
      return state
  }
}

// ── Context ──────────────────────────────────────────────────

interface GameContextValue {
  state: GameState
  dispatch: Dispatch<GameAction>
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState)
  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) {
    throw new Error('useGame must be used inside <GameProvider>')
  }
  return ctx
}
