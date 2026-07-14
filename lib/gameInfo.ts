// 遊戲目錄（處方系統等跨頁功能共用）：game_type → 名稱/emoji/路徑
// 新遊戲上架時記得同步這裡（與首頁 GAMES、profile/therapist GAME_NAMES）。

export interface GameInfo { name: string; emoji: string; route: string }

export const GAME_INFO: Record<string, GameInfo> = {
  'touch-collect': { name: '碰點收集',     emoji: '🎯', route: '/touch-collect' },
  'whack-mole':    { name: '復能打地鼠',   emoji: '🏅', route: '/whack-mole' },
  'slash-fruit':   { name: '復能切切樂',   emoji: '🍎', route: '/slash-fruit' },
  'farm':          { name: '復能開心農場', emoji: '🌻', route: '/farm' },
  'space-shooter': { name: '復能太空射擊', emoji: '🚀', route: '/space-shooter' },
  'aquarium':      { name: '復能水族箱',   emoji: '🐠', route: '/aquarium' },
  'fishing-king':  { name: '復能釣魚王',   emoji: '🎣', route: '/fishing-king' },
  'color-island':  { name: '彩球復能島',   emoji: '🎈', route: '/color-island' },
  'kitchen-catch': { name: '復能小廚房',   emoji: '🍳', route: '/kitchen-catch' },
  'grasp-place':   { name: '抓取放置',     emoji: '🤲', route: '/game/setup' },
  'wipe-trace':    { name: '擦拭軌跡',     emoji: '🧹', route: '/wipe-trace' },
  'pinch-sort':    { name: '夾取分類',     emoji: '🤏', route: '/pinch-sort' },
  'balance-shift': { name: '重心平衡',     emoji: '⚖️', route: '/balance-shift' },
  'wall-climb':    { name: '爬牆挑戰',     emoji: '🧗', route: '/wall-climb' },
  'rhythm-step':   { name: '節奏踏步',     emoji: '🥁', route: '/rhythm-step' },
  'sit-to-stand':  { name: '坐到站',       emoji: '🪑', route: '/sit-to-stand' },
  'badminton':     { name: '復能羽球',     emoji: '🏸', route: '/badminton' },
  'rhythm-drum':   { name: '節奏復能鼓',   emoji: '🪘', route: '/rhythm-drum' },
}

export const DIFF_LABELS: Record<string, string> = { easy: 'Level 1', medium: 'Level 2', hard: 'Level 3' }
