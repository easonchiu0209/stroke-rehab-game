// 佈景主題（即時爽感層獎勵）：農場/水族箱 hub 的背景主題。
// 兌換（30 分）後即套用，可在 hub 頁 🎨 按鈕循環切換已擁有的主題。

export interface ThemeDef {
  id: string
  name: string
  emoji: string
  farm: string       // 農場 hub 背景（CSS gradient）
  aquarium: string   // 水族箱 hub 背景
}

export const THEMES: Record<string, ThemeDef> = {
  default: { id: 'default', name: '經典', emoji: '🌤️', farm: 'linear-gradient(#cdeffb, #d8f3ad 26%, #b6e487)', aquarium: 'linear-gradient(#bdecff,#7fd0f5)' },
  sunset:  { id: 'sunset',  name: '黃昏', emoji: '🌇', farm: 'linear-gradient(#ffe3c2, #f8cf8d 30%, #e0b978)', aquarium: 'linear-gradient(#ffd9a0,#f0a866)' },
  starry:  { id: 'starry',  name: '星空', emoji: '🌌', farm: 'linear-gradient(#28355c, #33524a 40%, #3f6339)', aquarium: 'linear-gradient(#1a2c50,#2d5580)' },
  sakura:  { id: 'sakura',  name: '櫻花', emoji: '🌸', farm: 'linear-gradient(#ffe4ec, #ffd7e6 30%, #cae9b8)', aquarium: 'linear-gradient(#ffe0eb,#aedaf2)' },
}

export const PURCHASABLE_THEMES = ['sunset', 'starry', 'sakura'] as const
