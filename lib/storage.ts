import type { GameSession } from '@/types/game'
import { STORAGE_KEY, MAX_STORED_SESSIONS } from './constants'

export function loadSessions(): GameSession[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as GameSession[]) : []
  } catch {
    return []
  }
}

export function saveSession(session: GameSession): void {
  if (typeof window === 'undefined') return
  try {
    const sessions = loadSessions()
    const updated = [session, ...sessions].slice(0, MAX_STORED_SESSIONS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // localStorage quota exceeded or private mode — fail silently
    console.warn('Could not save session to localStorage')
  }
}

export function clearSessions(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
