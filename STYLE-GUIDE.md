# LifeMotionXR 美術風格指南 v1.0

> 所有新頁面、新遊戲、遊戲工廠產出都遵循本指南。既有頁面漸進式對齊（改到哪個頁面就順手對齊，不做大爆炸重構）。
> 核心原則：**適老優先**（大字、高對比、大觸控目標、無閃爍）、**溫暖鼓勵**（不懲罰、不冷冰）、**回饋感**（精緻度來自 juice，不是貼圖解析度）。

## 1. 色彩系統

### 平台色（非遊戲內頁面：首頁、兌換、社群、個人頁）
| 用途 | Tailwind | 備註 |
|---|---|---|
| 品牌主色 / 主 CTA | `green-600`（hover `green-700`）| 復能＝生長 |
| 次要動作 | `blue-500/600` | 導流按鈕（去玩、查看）|
| 積分/金幣 | `amber-400~600` | 獎勵一律暖色 |
| 稀有/高級 | `purple-500~700` | 解鎖券、徽章 |
| 中性文字/背景 | **`slate-*`**（不用 `gray-*`）| 全平台統一用 slate |
| 成功 | `green-*` ｜ 警告 `amber-*` ｜ 危險 `red-*` | 語意色 |

### 遊戲主題色（遊戲內頁面）
每款遊戲允許自己的主題色與滿版場景（GameScene themes：meadow/orchard/island/kitchen/calm...），但 HUD 結構、按鈕規格、結算頁版式必須共用。

### 對比標準（適老硬規範）
- 內文對比 ≥ 4.5:1、大字（≥24px）≥ 3:1（WCAG AA）
- 必要資訊不得只用 `slate-400` 以淺的顏色呈現在白底上（`slate-400` 只能當輔助註記）
- 不得以顏色為唯一區辨（配 emoji/圖示/文字）

## 2. 字級層級（html 基準 20px，勿改）
| 層級 | Class | 用途 |
|---|---|---|
| 頁面大標 | `text-3xl~4xl font-extrabold text-slate-900` | 每頁一個 |
| 卡片標題 | `font-extrabold text-slate-800` | 前綴至多 1 個 emoji |
| 內文 | `text-slate-700 leading-relaxed` | |
| 輔助說明 | `text-sm text-slate-500` | |
| 註記/時間 | `text-xs text-slate-400` | 非必要資訊限定 |
| 遊戲內 HUD 數字 | `text-2xl+ font-black` | 遊戲中一眼可讀 |

## 3. 形狀與陰影
- 卡片：`bg-white rounded-2xl shadow-sm p-4`（強調卡可加 `border border-{色}-200` 或淺色漸層底）
- 按鈕：`rounded-xl`；小型動作鈕/籤：`rounded-full`
- 彈窗/浮層：`rounded-2xl shadow-xl`
- 不用直角、不用超過 `shadow-xl` 的重陰影

## 4. 按鈕規格（觸控目標 ≥ 44px 高）
| 類型 | Class 模板 |
|---|---|
| 主 CTA（每頁至多一顆）| `py-4 rounded-xl bg-green-600 text-white font-extrabold text-xl shadow-lg active:scale-[0.97]` |
| 次要 | `py-4 rounded-xl border-2 border-slate-300 text-slate-700 font-semibold` |
| 行內小動作 | `px-3 py-1.5 rounded-full text-sm font-bold active:scale-95`＋語意色底 |
| 停用態 | `disabled:opacity-40`（不改變版面）|
- 全部按鈕帶 `active:scale-95~[0.97]`（按了有感）

## 5. Emoji 使用原則
- Emoji 是平台的圖示系統（跨平台、彩色、零資產成本）：功能入口、任務、獎勵一律用 emoji 開頭
- 一個標題最多 1 個 emoji；數據行可用小 emoji 當前綴（🪙 🫧 🎯）
- 遊戲目標物用 emoji（GAME-FACTORY 契約），大小由 `visualEm` 控制

## 6. 動效與回饋（game juice）
- 命中/獎勵：`JuiceLayer`（粒子/彈跳字/微震）；掉落通知：`RewardDropToast`（lmx:drop 事件）
- 目標物出現用 `juicePopIn`（globals.css），消失用縮放淡出
- **禁止**：閃爍（>3Hz）、大幅螢幕震動（>6px）、Game Over 式懲罰演出
- 音效/語音走 `lib/feedback.ts`（有使用者開關，勿另起爐灶）

## 7. 頁面骨架
- 非遊戲頁：`min-h-screen` 淺色漸層底（`from-{主題}-50 to-slate-50`）＋ `max-w-lg/xl mx-auto` 卡片流
- 遊戲頁狀態機：`config → countdown → playing → results`（GAME-FACTORY 契約），結算頁必有「返回首頁／再玩一次」雙鈕（次要/主要）
- 提示浮層統一位置：代償提醒 top-16 置中、掉落通知 bottom-6 置中、toast top-6 置中

## 8. 文案語氣（與法規紅線）
- 溫暖、口語、繁中；對長者句子短、不用專業縮寫
- 不懲罰：沒有「失敗/Game Over」，用「完成了！/繼續加油」
- **禁用詞**（法遵）：治癒、療效、診斷、保證、痊癒、根治；一律用「訓練、復能、表現、紀錄」
