// ============================================================
// 復能開心農場 — 共用定義（client 與 API route 共用）
// ============================================================

export type Species =
  // 作物
  | 'carrot' | 'corn' | 'potato' | 'tomato' | 'onion' | 'mushroom'
  | 'eggplant' | 'pepper' | 'strawberry' | 'broccoli' | 'sunflower'
  | 'pumpkin' | 'grape' | 'apple' | 'peach' | 'watermelon' | 'pineapple'
  // 動物
  | 'chicken' | 'duck' | 'rabbit' | 'pig' | 'bee'
  | 'cow' | 'sheep' | 'goat' | 'turkey' | 'horse'

export interface SpeciesDef {
  id:         Species
  name:       string       // 中文名
  kind:       'crop' | 'animal'
  stages:     string[]     // 各成長階段 emoji，最後一階＝成熟/成年
  reward:     number       // 採收/收成獲得金幣
  unlockCost: number       // 解鎖花費金幣（0＝預設已解鎖）
}

export const SPECIES: Record<Species, SpeciesDef> = {
  // ── 作物 ───────────────────────────────────────────────
  carrot:     { id: 'carrot',     name: '紅蘿蔔', kind: 'crop', stages: ['🌱', '🌿', '🥕'], reward: 3, unlockCost: 0 },
  corn:       { id: 'corn',       name: '玉米',   kind: 'crop', stages: ['🌱', '🌾', '🌽'], reward: 4, unlockCost: 0 },
  potato:     { id: 'potato',     name: '馬鈴薯', kind: 'crop', stages: ['🌱', '🌿', '🥔'], reward: 4, unlockCost: 20 },
  onion:      { id: 'onion',      name: '洋蔥',   kind: 'crop', stages: ['🌱', '🌿', '🧅'], reward: 4, unlockCost: 22 },
  tomato:     { id: 'tomato',     name: '番茄',   kind: 'crop', stages: ['🌱', '🌿', '🍅'], reward: 5, unlockCost: 25 },
  mushroom:   { id: 'mushroom',   name: '蘑菇',   kind: 'crop', stages: ['🌱', '🍄', '🍄'], reward: 5, unlockCost: 28 },
  eggplant:   { id: 'eggplant',   name: '茄子',   kind: 'crop', stages: ['🌱', '🌿', '🍆'], reward: 5, unlockCost: 30 },
  pepper:     { id: 'pepper',     name: '辣椒',   kind: 'crop', stages: ['🌱', '🌿', '🌶️'], reward: 5, unlockCost: 32 },
  strawberry: { id: 'strawberry', name: '草莓',   kind: 'crop', stages: ['🌱', '🌸', '🍓'], reward: 6, unlockCost: 40 },
  broccoli:   { id: 'broccoli',   name: '花椰菜', kind: 'crop', stages: ['🌱', '🌿', '🥦'], reward: 6, unlockCost: 42 },
  sunflower:  { id: 'sunflower',  name: '向日葵', kind: 'crop', stages: ['🌱', '🌿', '🌻'], reward: 6, unlockCost: 45 },
  pumpkin:    { id: 'pumpkin',    name: '南瓜',   kind: 'crop', stages: ['🌱', '🌿', '🎃'], reward: 7, unlockCost: 55 },
  grape:      { id: 'grape',      name: '葡萄',   kind: 'crop', stages: ['🌱', '🌿', '🍇'], reward: 8, unlockCost: 60 },
  apple:      { id: 'apple',      name: '蘋果',   kind: 'crop', stages: ['🌱', '🌳', '🍎'], reward: 8, unlockCost: 65 },
  peach:      { id: 'peach',      name: '水蜜桃', kind: 'crop', stages: ['🌱', '🌳', '🍑'], reward: 8, unlockCost: 68 },
  watermelon: { id: 'watermelon', name: '西瓜',   kind: 'crop', stages: ['🌱', '🌿', '🍉'], reward: 9, unlockCost: 75 },
  pineapple:  { id: 'pineapple',  name: '鳳梨',   kind: 'crop', stages: ['🌱', '🌿', '🍍'], reward: 9, unlockCost: 80 },
  // ── 動物 ───────────────────────────────────────────────
  chicken:    { id: 'chicken',    name: '小雞',   kind: 'animal', stages: ['🐣', '🐤', '🐔'], reward: 4, unlockCost: 0 },
  duck:       { id: 'duck',       name: '鴨子',   kind: 'animal', stages: ['🐣', '🦆', '🦆'], reward: 5, unlockCost: 30 },
  rabbit:     { id: 'rabbit',     name: '兔子',   kind: 'animal', stages: ['🐰', '🐇', '🐇'], reward: 5, unlockCost: 35 },
  pig:        { id: 'pig',        name: '小豬',   kind: 'animal', stages: ['🐷', '🐖', '🐖'], reward: 6, unlockCost: 35 },
  bee:        { id: 'bee',        name: '蜜蜂',   kind: 'animal', stages: ['🐛', '🐝', '🐝'], reward: 6, unlockCost: 45 },
  cow:        { id: 'cow',        name: '乳牛',   kind: 'animal', stages: ['🐮', '🐄', '🐄'], reward: 7, unlockCost: 50 },
  sheep:      { id: 'sheep',      name: '綿羊',   kind: 'animal', stages: ['🐏', '🐑', '🐑'], reward: 7, unlockCost: 52 },
  goat:       { id: 'goat',       name: '山羊',   kind: 'animal', stages: ['🐐', '🐐', '🐐'], reward: 7, unlockCost: 55 },
  turkey:     { id: 'turkey',     name: '火雞',   kind: 'animal', stages: ['🐣', '🦃', '🦃'], reward: 8, unlockCost: 60 },
  horse:      { id: 'horse',      name: '小馬',   kind: 'animal', stages: ['🐴', '🐎', '🐎'], reward: 10, unlockCost: 90 },
}

export const DEFAULT_UNLOCKED: Species[] = ['carrot', 'corn', 'chicken']

export const ALL_SPECIES = Object.values(SPECIES)

// ── 型別 ─────────────────────────────────────────────────────

export interface Plot {
  idx:     number
  kind:    'crop' | 'animal' | 'empty'
  species: Species | null
  stage:   number
}

export interface FarmState {
  level:         number
  coins:         number
  plot_count:    number
  unlocked:      Species[]
  total_harvest: number
  plots:         Plot[]
}

// ── 規則 helpers ──────────────────────────────────────────────

export function ripeStage(sp: Species): number {
  return SPECIES[sp].stages.length - 1
}

/** 該田地是否成熟（可採收，會在 AR 照顧 session 中冒出來） */
export function isRipe(plot: Plot): boolean {
  if (plot.kind === 'empty' || !plot.species) return false
  return plot.stage >= ripeStage(plot.species)
}

/** 取得田地目前顯示的 emoji */
export function plotEmoji(plot: Plot): string {
  if (plot.kind === 'empty' || !plot.species) return ''
  const sp = SPECIES[plot.species]
  return sp.stages[Math.min(plot.stage, sp.stages.length - 1)]
}

/** 農場等級門檻：每累計 N 次採收升一級 */
export function levelForHarvest(totalHarvest: number): number {
  return 1 + Math.floor(totalHarvest / 15)
}

/** 擴田花費：目前田數越多越貴 */
export function expandCost(plotCount: number): number {
  return Math.round(plotCount * 6)
}
