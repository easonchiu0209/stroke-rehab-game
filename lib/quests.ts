// 每日任務（留存三件套之三）— 任務由「台灣日期」決定性生成，全平台同一天同一組。
// 指定遊戲每日輪替，優先曝光冷門遊戲（解決部分遊戲零遊玩的問題）。
// 進度從當日 game_sessions 即時計算；領獎冪等由 quest_claims 表把關。

export interface QuestDef {
  id: string                 // 當日穩定代號（領獎 key）
  title: string
  emoji: string
  target: number             // 目標次數
  reward: { coins: number; pearls: number }
  route?: string             // 點卡片可直達的遊戲路徑
  check: 'play_game' | 'any_sessions' | 'accuracy70'
  gameType?: string          // check=play_game 時的指定遊戲
}

// 指定遊戲輪替池（單場快玩類；名稱對應首頁 GAMES）
const ROTATION: { id: string; name: string; emoji: string; route: string }[] = [
  { id: 'slash-fruit',   name: '復能切切樂', emoji: '🍎', route: '/slash-fruit' },
  { id: 'color-island',  name: '彩球復能島', emoji: '🎈', route: '/color-island' },
  { id: 'space-shooter', name: '復能太空射擊', emoji: '🚀', route: '/space-shooter' },
  { id: 'kitchen-catch', name: '復能小廚房', emoji: '🍳', route: '/kitchen-catch' },
  { id: 'whack-mole',    name: '復能打地鼠', emoji: '🏅', route: '/whack-mole' },
  { id: 'pinch-sort',    name: '夾取分類',   emoji: '🤏', route: '/pinch-sort' },
  { id: 'touch-collect', name: '碰點收集',   emoji: '🎯', route: '/touch-collect' },
  { id: 'wipe-trace',    name: '擦拭軌跡',   emoji: '🧹', route: '/wipe-trace' },
  { id: 'fishing-king',  name: '復能釣魚王', emoji: '🐠', route: '/fishing-king' },
  { id: 'badminton',     name: '復能羽球',   emoji: '🏸', route: '/badminton' },
]

/** 台灣日期字串 YYYY-MM-DD */
export function todayTW(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
}

/** 當日台灣 00:00 的 UTC 時間（查詢當日 sessions 用） */
export function dayStartUTC(now = new Date()): Date {
  const d = todayTW(now)
  return new Date(new Date(`${d}T00:00:00Z`).getTime() - 8 * 3600_000)
}

function dateSeed(dateStr: string): number {
  let h = 0
  for (let i = 0; i < dateStr.length; i++) h = (h * 31 + dateStr.charCodeAt(i)) >>> 0
  return h
}

/** 當日三格任務（決定性） */
export function buildDailyQuests(dateStr: string): QuestDef[] {
  const g = ROTATION[dateSeed(dateStr) % ROTATION.length]
  return [
    {
      id: `play:${g.id}`,
      title: `玩 1 場「${g.name}」`,
      emoji: g.emoji,
      target: 1,
      reward: { coins: 10, pearls: 0 },
      route: g.route,
      check: 'play_game',
      gameType: g.id,
    },
    {
      id: 'any2',
      title: '完成任 2 場訓練',
      emoji: '🎮',
      target: 2,
      reward: { coins: 8, pearls: 1 },
      check: 'any_sessions',
    },
    {
      id: 'acc70',
      title: '任 1 場命中率達 70%',
      emoji: '🎯',
      target: 1,
      reward: { coins: 6, pearls: 2 },
      check: 'accuracy70',
    },
  ]
}

export interface SessionLite { game_type: string; accuracy: number | null }

/** 依當日 sessions 計算進度 */
export function questProgress(q: QuestDef, sessions: SessionLite[]): number {
  switch (q.check) {
    case 'play_game':    return sessions.filter(s => s.game_type === q.gameType).length
    case 'any_sessions': return sessions.length
    case 'accuracy70':   return sessions.filter(s => (s.accuracy ?? 0) >= 70).length
  }
}
