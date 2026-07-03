// 復能水族箱 — 共用定義（client 與 API 共用）

export type Fish =
  | 'clownfish' | 'goldfish' | 'puffer' | 'shrimp' | 'crab' | 'shell' | 'frog'
  | 'octopus' | 'squid' | 'jellyfish' | 'penguin' | 'swan' | 'lobster' | 'turtle' | 'seal' | 'otter'
  | 'dolphin' | 'whale' | 'shark' | 'crocodile'

export interface FishDef {
  id:         Fish
  name:       string
  emoji:      string
  rarity:     'common' | 'rare' | 'epic'
  pearl:      number   // 成年後每場產生的珍珠
  unlockCost: number   // 解鎖花費（0 = 預設）
}

export const FISHES: Record<Fish, FishDef> = {
  // ── 普通 ───────────────────────────────────────────────
  clownfish: { id: 'clownfish', name: '小丑魚', emoji: '🐠', rarity: 'common', pearl: 1, unlockCost: 0 },
  goldfish:  { id: 'goldfish',  name: '金魚',   emoji: '🐟', rarity: 'common', pearl: 1, unlockCost: 0 },
  puffer:    { id: 'puffer',    name: '河豚',   emoji: '🐡', rarity: 'common', pearl: 1, unlockCost: 0 },
  shrimp:    { id: 'shrimp',    name: '蝦子',   emoji: '🦐', rarity: 'common', pearl: 1, unlockCost: 0 },
  crab:      { id: 'crab',      name: '螃蟹',   emoji: '🦀', rarity: 'common', pearl: 1, unlockCost: 0 },
  shell:     { id: 'shell',     name: '貝殼',   emoji: '🐚', rarity: 'common', pearl: 2, unlockCost: 15 },
  frog:      { id: 'frog',      name: '青蛙',   emoji: '🐸', rarity: 'common', pearl: 2, unlockCost: 20 },
  // ── 稀有 ───────────────────────────────────────────────
  octopus:   { id: 'octopus',   name: '章魚',   emoji: '🐙', rarity: 'rare',   pearl: 3, unlockCost: 30 },
  squid:     { id: 'squid',     name: '魷魚',   emoji: '🦑', rarity: 'rare',   pearl: 3, unlockCost: 30 },
  jellyfish: { id: 'jellyfish', name: '水母',   emoji: '🪼', rarity: 'rare',   pearl: 3, unlockCost: 35 },
  penguin:   { id: 'penguin',   name: '企鵝',   emoji: '🐧', rarity: 'rare',   pearl: 3, unlockCost: 40 },
  lobster:   { id: 'lobster',   name: '龍蝦',   emoji: '🦞', rarity: 'rare',   pearl: 4, unlockCost: 40 },
  turtle:    { id: 'turtle',    name: '海龜',   emoji: '🐢', rarity: 'rare',   pearl: 4, unlockCost: 45 },
  swan:      { id: 'swan',      name: '天鵝',   emoji: '🦢', rarity: 'rare',   pearl: 4, unlockCost: 50 },
  seal:      { id: 'seal',      name: '海豹',   emoji: '🦭', rarity: 'rare',   pearl: 4, unlockCost: 52 },
  otter:     { id: 'otter',     name: '水獺',   emoji: '🦦', rarity: 'rare',   pearl: 5, unlockCost: 55 },
  // ── 稀世 ───────────────────────────────────────────────
  dolphin:   { id: 'dolphin',   name: '海豚',   emoji: '🐬', rarity: 'epic',   pearl: 6, unlockCost: 80 },
  shark:     { id: 'shark',     name: '鯊魚',   emoji: '🦈', rarity: 'epic',   pearl: 7, unlockCost: 100 },
  crocodile: { id: 'crocodile', name: '鱷魚',   emoji: '🐊', rarity: 'epic',   pearl: 7, unlockCost: 110 },
  whale:     { id: 'whale',     name: '鯨魚',   emoji: '🐳', rarity: 'epic',   pearl: 8, unlockCost: 120 },
}

export const ALL_FISH = Object.values(FISHES)
export const DEFAULT_UNLOCKED: Fish[] = ['clownfish', 'goldfish', 'puffer', 'shrimp', 'crab']
export const MAX_STAGE = 2   // 0 幼 → 1 中 → 2 成年

export interface TankFish { id: string; species: Fish; stage: number }
export interface AquariumState {
  pearls:       number
  level:        number
  capacity:     number
  total_caught: number
  unlocked:     Fish[]
  discovered:   Fish[]
  fish:         TankFish[]
}

export function expandCost(capacity: number): number {
  return Math.round(capacity * 5)
}
export function levelForCaught(total: number): number {
  return 1 + Math.floor(total / 10)
}
/** 釣魚時依稀有度隨機抽一隻（解鎖池中），common 機率高 */
export function rollFish(unlocked: Fish[]): Fish {
  const weighted: Fish[] = []
  for (const f of unlocked) {
    const def = FISHES[f]
    const w = def.rarity === 'common' ? 6 : def.rarity === 'rare' ? 2 : 1
    for (let i = 0; i < w; i++) weighted.push(f)
  }
  return weighted[Math.floor(Math.random() * weighted.length)] ?? 'goldfish'
}
