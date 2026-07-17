import { FLAGSHIP_GAMES } from '@/lib/retentionAgent'

export type FlagshipGameId = 'touch-collect' | 'slash-fruit' | 'rhythm-drum' | 'badminton'

export interface FlagshipStamp {
  gameId: FlagshipGameId
  completedAt: string
}

export interface FlagshipPassportState {
  stamps: FlagshipStamp[]
  unlocked: boolean
  unlockedAt: string | null
}

export const FLAGSHIP_PASSPORT_KEY = 'lmx-flagship-passport-v1'
export const FLAGSHIP_UNLOCK_NAME = '晨光小鎮旗艦紀念旗'

const FLAGSHIP_IDS = new Set(FLAGSHIP_GAMES.map((game) => game.id))

function isFlagshipGameId(value: string): value is FlagshipGameId {
  return FLAGSHIP_IDS.has(value)
}

function emptyState(): FlagshipPassportState {
  return { stamps: [], unlocked: false, unlockedAt: null }
}

export function readFlagshipPassport(): FlagshipPassportState {
  if (typeof window === 'undefined') return emptyState()
  try {
    const raw = window.localStorage.getItem(FLAGSHIP_PASSPORT_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as Partial<FlagshipPassportState>
    const stamps = Array.isArray(parsed.stamps)
      ? parsed.stamps.filter((stamp): stamp is FlagshipStamp =>
        !!stamp &&
        typeof stamp.gameId === 'string' &&
        isFlagshipGameId(stamp.gameId) &&
        typeof stamp.completedAt === 'string',
      )
      : []

    const unique = new Map<FlagshipGameId, FlagshipStamp>()
    stamps.forEach((stamp) => {
      if (!unique.has(stamp.gameId)) unique.set(stamp.gameId, stamp)
    })

    return {
      stamps: Array.from(unique.values()),
      unlocked: Boolean(parsed.unlocked),
      unlockedAt: typeof parsed.unlockedAt === 'string' ? parsed.unlockedAt : null,
    }
  } catch {
    return emptyState()
  }
}

export function writeFlagshipPassport(state: FlagshipPassportState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FLAGSHIP_PASSPORT_KEY, JSON.stringify(state))
    window.dispatchEvent(new CustomEvent('lmx:flagship-passport', { detail: state }))
  } catch {
    // 本機儲存失敗時不阻擋訓練結算。
  }
}

export function recordFlagshipCompletion(gameId: FlagshipGameId, completedAt = new Date()) {
  const current = readFlagshipPassport()
  if (!current.stamps.some((stamp) => stamp.gameId === gameId)) {
    current.stamps.push({ gameId, completedAt: completedAt.toISOString() })
  }

  const completedIds = new Set(current.stamps.map((stamp) => stamp.gameId))
  const nowUnlocked = FLAGSHIP_GAMES.every((game) => completedIds.has(game.id as FlagshipGameId))
  const next: FlagshipPassportState = {
    stamps: current.stamps,
    unlocked: current.unlocked || nowUnlocked,
    unlockedAt: current.unlockedAt ?? (nowUnlocked ? completedAt.toISOString() : null),
  }
  writeFlagshipPassport(next)
  return next
}

export function getFlagshipPassportProgress(state: FlagshipPassportState) {
  const completedIds = new Set(state.stamps.map((stamp) => stamp.gameId))
  return {
    completed: FLAGSHIP_GAMES.filter((game) => completedIds.has(game.id as FlagshipGameId)),
    remaining: FLAGSHIP_GAMES.filter((game) => !completedIds.has(game.id as FlagshipGameId)),
    total: FLAGSHIP_GAMES.length,
    completedCount: completedIds.size,
  }
}
