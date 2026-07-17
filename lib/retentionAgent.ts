export interface RetentionSession {
  game_type: string
  created_at: string
}

export interface FlagshipGame {
  id: string
  name: string
  emoji: string
  route: string
}

export interface WeeklyChapter {
  id: string
  title: string
  story: string
  emoji: string
  accent: string
}

export const FLAGSHIP_GAMES: FlagshipGame[] = [
  { id: 'touch-collect', name: '碰點收集', emoji: '🎯', route: '/touch-collect' },
  { id: 'slash-fruit', name: '復能切切樂', emoji: '🍎', route: '/slash-fruit' },
  { id: 'rhythm-drum', name: '節奏復能鼓', emoji: '🪘', route: '/rhythm-drum' },
  { id: 'badminton', name: '復能羽球', emoji: '🏸', route: '/badminton' },
]

export const WEEKLY_CHAPTERS: WeeklyChapter[] = [
  { id: 'orchard', title: '果園復甦週', story: '喚醒果園、點亮小徑，讓晨光重新回到鎮上。', emoji: '🌳', accent: '#15803d' },
  { id: 'music', title: '星光音樂祭', story: '收集節奏與笑聲，為週末的廣場演出做準備。', emoji: '🎵', accent: '#b45309' },
  { id: 'lake', title: '湖畔友誼賽', story: '完成本週旅程，幫小鎮修好湖畔的練習場。', emoji: '🏞️', accent: '#0369a1' },
  { id: 'lantern', title: '晨光燈火節', story: '一步一步收集燈火，讓整座小鎮在夜裡發亮。', emoji: '🏮', accent: '#be123c' },
]

const TAIPEI_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function taipeiDateKey(value: Date | string) {
  return TAIPEI_FORMATTER.format(typeof value === 'string' ? new Date(value) : value)
}

export function taipeiWeekKey(value: Date | string) {
  const [year, month, day] = taipeiDateKey(value).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const daysFromMonday = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - daysFromMonday)
  return date.toISOString().slice(0, 10)
}

export function weeklyChapterFor(value: Date = new Date()) {
  const monday = new Date(`${taipeiWeekKey(value)}T00:00:00Z`)
  const weekNumber = Math.floor(monday.getTime() / 604800000)
  return WEEKLY_CHAPTERS[((weekNumber % WEEKLY_CHAPTERS.length) + WEEKLY_CHAPTERS.length) % WEEKLY_CHAPTERS.length]
}

export function buildWeeklyJourney(sessions: RetentionSession[], now: Date = new Date()) {
  const weekKey = taipeiWeekKey(now)
  const current = sessions.filter(session => taipeiWeekKey(session.created_at) === weekKey)
  const flagshipSessions = current.filter(session => FLAGSHIP_GAMES.some(game => game.id === session.game_type))
  const playedGames = new Set(flagshipSessions.map(session => session.game_type))
  const activeDays = new Set(current.map(session => taipeiDateKey(session.created_at)))
  const counts = new Map(FLAGSHIP_GAMES.map(game => [game.id, 0]))
  flagshipSessions.forEach(session => counts.set(session.game_type, (counts.get(session.game_type) ?? 0) + 1))

  const milestones = [
    { id: 'start', label: '展開旅程', detail: '完成 1 場', complete: current.length >= 1 },
    { id: 'variety', label: '探索小鎮', detail: '體驗 2 款旗艦', complete: playedGames.size >= 2 },
    { id: 'return', label: '點亮本週', detail: '3 場、分 2 天完成', complete: current.length >= 3 && activeDays.size >= 2 },
  ]

  const nextGame = [...FLAGSHIP_GAMES].sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0))[0]
  return {
    weekKey,
    chapter: weeklyChapterFor(now),
    sessions: current.length,
    activeDays: activeDays.size,
    playedGames: playedGames.size,
    milestones,
    completed: milestones.every(milestone => milestone.complete),
    nextGame,
  }
}
