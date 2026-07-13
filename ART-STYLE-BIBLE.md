# LifeMotionXR 美術風格聖經 (Art Style Bible) v1.0

> **定位**：這是全平台「遊戲內畫質」的統一憲法。`STYLE-GUIDE.md` 管的是平台外殼（首頁/兌換/後台的版式、字級、按鈕）；本檔管的是**遊戲場景裡的視覺爽感**——色板、光影、粒子、juice、AI 生圖。兩者不衝突，遊戲頁同時受兩者約束。
>
> **對標水準**：近十年熱門手遊的「風格化卡通渲染 (stylized cartoon render)」。三個借鏡對象只借**手法與等級，不碰任何 IP／角色／素材／名稱**：
> - 多汁噴濺的命中回饋（水果切開的爆汁感）
> - 霓虹節奏的光效與節拍呼吸（節奏光劍的螢光律動）
> - 圓潤療癒的造型與配色（動物村莊的無稜角親和感）
>
> **鐵律（受眾＝中風長者，凌駕一切美感取捨）**：高對比、大目標、暖色鼓勵、**不刺眼、不閃爍、不懲罰**。任何特效若與「適老可讀」衝突，一律砍特效。
>
> **量產原則**：精緻度來自「**程序化 juice（Canvas/CSS/SVG 粒子）＋ 統一色板**」，不是貼圖解析度。AI 生圖只做「背景／道具／角色底圖」，動態爽感全靠本檔第 4、5 章的程序層。既有遊戲**漸進升級**（改到哪款順手對齊），不砍掉重練。

---

## 1. 統一色板 (Unified Palette)

色板分三組：**平台色**（承接 STYLE-GUIDE，遊戲 HUD／按鈕沿用）、**場景色**（遊戲背景天空／地面）、**慶祝與霓虹色**（粒子／combo／光效）。所有 hex 已在現有程式碼出現或與之相容。

### 1.1 平台色（HUD、按鈕、結算頁沿用）
| 語意 | 名稱 | Hex | Tailwind | 使用場合 |
|---|---|---|---|---|
| 品牌主色 | 生長綠 | `#16A34A` | green-600 | 主 CTA、成功數字、進度條 |
| 主色 hover | 深綠 | `#15803D` | green-700 | 按下態 |
| 次要動作 | 導引藍 | `#3B82F6` | blue-500 | 「去玩／查看」導流、手部游標可選色 |
| 獎勵金（淺→深）| 陽光金 | `#FBBF24`→`#F59E0B`→`#D97706` | amber-400/500/600 | 金幣、+分、星星、寶箱 |
| 稀有／高級 | 夢幻紫 | `#8B5CF6`→`#7C3AED` | violet-500/600 | 解鎖券、稀有徽章、combo 上限特效 |
| 深文字 | 石板 900 | `#0F172A` | slate-900 | 大標 |
| 內文 | 石板 700 | `#334155` | slate-700 | 說明文字 |
| 輔助 | 石板 500 | `#64748B` | slate-500 | 次要註記（白底可讀下限）|
| 淺註記 | 石板 400 | `#94A3B8` | slate-400 | **僅非必要資訊**，不可承載關鍵訊息 |
| 底 | 石板 50 | `#F8FAFC` | slate-50 | 頁面底色 |

### 1.2 語意色（回饋一致性，全平台不得亂換）
| 語意 | Hex | 場合 |
|---|---|---|
| 成功／得分 | `#22C55E` | 命中、正確、達標 |
| 警告／代償提醒 | `#F59E0B` | 姿勢代償、時間快到 |
| 危險／扣分 | `#EF4444` | 碰到炸彈/害蟲（**用「−5」數字＋圖示，不用紅色閃爍**）|
| 中性提示光暈 | `rgba(255,255,255,0.5)` | 目標可擊光暈（見 §2）|

### 1.3 慶祝色板（粒子預設，對標爆汁噴濺）
現行 `JuiceLayer` 的 `DEFAULT_COLORS` 即為本平台「彩紙慶祝色」，**維持不動**，新遊戲直接吃：
```
金 #FFD600 · 橙 #FF9800 · 草綠 #8BC34A · 天藍 #4FC3F7 · 粉 #F48FB1
```
- 一般命中：用整組（繽紛彩紙感）。
- 主題化命中（水果／食物）：改用**該物件本色**當噴濺色，強化「爆汁」聯想。汁液參考色：
  西瓜紅 `#FB5B5B`、柳橙 `#FF9F43`、奇異果綠 `#7ED957`、藍莓 `#5B8DEF`、葡萄紫 `#A66CFF`。

### 1.4 霓虹色板（對標節奏光效，僅節奏/射擊類 combo 用）
節奏鼓、太空射擊的「連段/beat 命中」可疊一層螢光，**限背景已足夠暗（calm/starry 主題）時使用**，避免亮底上的霓虹造成眩光：
```
螢光青 #22D3EE · 螢光洋紅 #F472B6 · 螢光紫 #A78BFA · 螢光萊姆 #A3E635
```
用法：光暈 `box-shadow: 0 0 24px <neon>66`（透明度壓到 40% 內），**不做高頻閃爍**（見 §4/§5 禁令）。

### 1.5 長者可讀性硬規範（凌駕美感）
- 目標物與其正後方背景對比 **≥ 4.5:1**；目標直徑 **≥ 螢幕短邊 12%**。
- **不得以顏色為唯一區辨**：得分綠色 vs 扣分紅色，一律再配 emoji（✅/💥）＋數字（+10/−5）。
- 背景飽和度壓在中低（避免與目標搶眼球）；**目標永遠比背景亮、比背景飽和**。
- 禁止亮度在 >3Hz 反覆跳變（癲癇/眩暈風險，見 §4）。

---

## 2. 光影與質感規範 (Light, Gloss & Shadow)

統一「**單一柔和頂光 + 圓潤高光 + 落地軟陰影**」的卡通打光，讓所有物件像同一個世界。以下寫法可直接複製。

### 2.1 落地陰影（所有目標物必加，製造「浮起來」的立體）
```css
filter: drop-shadow(0 4px 8px rgba(0,0,0,0.35));   /* 主目標，現行 whack-mole 用法 */
filter: drop-shadow(0 3px 4px rgba(0,0,0,0.30));   /* 附屬小物（棍子、配件）*/
```
- 陰影**只往下**（`0 Ypx`，Y 正值），角度統一＝頂光。禁止四面外擴的重陰影。

### 2.2 圓潤高光（塑膠/軟糖質感，對標圓潤療癒風）
在圓形目標左上疊一層徑向白高光：
```css
background: radial-gradient(circle at 32% 28%, rgba(255,255,255,0.85), rgba(255,255,255,0) 45%);
```
- 高光位置固定左上（與頂光一致），讓所有球體/水果/氣泡一眼同源。

### 2.3 可擊光暈（給長者的「這裡可以打」提示，中性白）
```css
background: radial-gradient(circle, rgba(255,255,255,0.5), rgba(255,255,255,0.12) 55%, transparent 70%);
animation: targetPulse 1.2s ease-in-out infinite;   /* 呼吸，不閃爍 */
```
（現行 whack-mole `molePulse`、tailwind `target-pulse` 皆為此規範的實例。）

### 2.4 場景天空漸層（滿版背景，沿用現行 SceneKit `SKY`）
統一用「上淺下深、天→地」的雙/三段線性漸層，飽和度中低：
```
草原 meadow : linear-gradient(#bfe6ff 0%, #d8f1ff 33%, #9ed873 33%, #6fae3f 100%)
果園 orchard: linear-gradient(#cdecff 0%, #e3f4ff 30%, #bfe08a 30%, #7fb84a 100%)
海島 island : linear-gradient(#74cdff 0%, #bfeaff 38%, #59b6e8 38%, #2f86c4 62%, #ffe39a 62%, #f5c46a 100%)
廚房 kitchen: linear-gradient(#ffe9cf 0%, #ffdcb0 55%, #d9a06a 55%, #b9824e 100%)
靜謐 calm   : radial-gradient(circle at 50% 32%, #3a3f80, #1a1c40 70%, #101230 100%)
```
新場景照此配方擴充：**天空段淺、地面段深、交界一條硬邊**（卡通分層感）。

### 2.5 中央聚焦暈影（把注意力壓回畫面中心，適老）
```css
box-shadow: inset 0 0 120px 30px rgba(0,0,0,0.25);   /* SceneFront 用法 */
```

### 2.6 發光高光（金光/霓虹，克制使用）
```css
box-shadow: 0 0 18px rgba(255,214,0,0.5);            /* 金色目標/游標光環（現行手部游標）*/
box-shadow: 0 0 24px rgba(34,211,238,0.4);           /* combo 霓虹光，僅暗底 */
```

---

## 3. 形狀與線條語言 (Shape & Line)

**核心語彙：圓、胖、無稜角**。對標圓潤療癒風，同時服務長者「大而好認」。

- **圓角層級**（沿用 STYLE-GUIDE，遊戲內同步）：
  - 卡片/浮層：`rounded-2xl`（16px）
  - 按鈕：`rounded-xl`（12px）
  - 小籤/膠囊/HUD 藥丸：`rounded-full`
  - 目標物：正圓 `border-radius: 50%` 為主；方形道具最小 `rounded-xl`，**禁止直角**。
- **描邊**：卡通描邊用「**外光暈或深色細邊**」，不用生硬 1px 黑線。
  - 目標可加 `outline` 感：`box-shadow: 0 0 0 3px rgba(255,255,255,0.7)`（白邊提升在雜亂鏡頭背景上的辨識度）。
  - 手部游標＝現行規範：`3px solid #FFD600` ＋ 半透明底 ＋ 外光暈。
- **比例**：角色/道具走「**大頭、短身、圓肚**」的 Q 版比例（約 1:1～1:1.4 寬高），親和且遠看可辨。
- **筆畫粗細**：SVG/CSS 線條最小 `3px`（長者視力＋鏡頭壓縮下才看得清）。
- **留白**：目標之間最小間距 ≥ 一個目標半徑，避免密集恐懼與誤觸。

---

## 4. 粒子特效規範 (Particle FX)

全部走共用 `components/game/JuiceLayer.tsx`（`burst` / `floatText` / `shake`），新遊戲**不自造粒子系統**。以下給各情境的觸發時機與建議參數（`burst` 的 `opts`）。

| 情境 | 觸發時機 | 建議參數 | 色板 |
|---|---|---|---|
| **一般命中** | 目標被擊中當幀 | `count: 14`（預設）| 慶祝色板 §1.3 |
| **爆汁噴濺**（水果/食物）| 切中/抓中可食目標 | `count: 16, emojis:['💧','✨']` | 該物件本色（西瓜紅等）|
| **星星獎勵**（達標/連對）| 連續命中里程碑 | `count: 10, emojis:['⭐','✨']` | 金 `#FFD600` |
| **Combo 光效**（節奏/射擊）| 連段數 ≥ N | `count: 12, emojis:['✨']` ＋ §2.6 霓虹光暈 | 霓虹色板 §1.4 |
| **彩帶慶祝**（結算/破紀錄）| 進結算頁、刷新高分 | `count: 24, emojis:['🎉','🎊']`，可連放 2 次 | 慶祝色板全組 |
| **扣分/失誤煙霧** | 碰到害蟲/炸彈/切錯 | `count: 10, emojis:['💨']` ＋ `floatText '−5' color:'#EF4444'` | 灰 `#616161 #9e9e9e` |
| **分數彈跳字** | 任何加減分 | `floatText(nx, ny-0.06, '+10')` | 加分金 `#FFD600`／扣分紅 `#EF4444` |

**粒子物理（JuiceLayer 內建，數值即規範，改動需同步本檔）**：
- 重力 `vy += 0.35`／幀；空氣阻力 `vx*=0.96, vy*=0.985`。
- 初速 `3–8`，向上偏移 `-2.5`（先噴起再落下＝爆汁弧線）。
- 壽命 `550–900ms`，末段 `alpha = 1 - age²` **平滑淡出（絕不瞬滅、絕不閃爍）**。
- 每第 5 顆換成 emoji 碎片（混入貼圖感）。
- **適老紅線**：單次粒子數 ≤ 28；同時在畫面的粒子總量 ≤ ~60（效能＋不淹沒目標）。

---

## 5. 動畫 Game Juice 規範

「爽感」＝擠壓拉伸＋彈性緩動＋克制的震動與慢動作。數值可直接抄。

### 5.1 擠壓拉伸 (Squash & Stretch)
現行 `globals.css` 已有，全遊戲共用：
```css
@keyframes juicePopIn { 0%{transform:scale(0)} 60%{transform:scale(1.15)} 80%{transform:scale(0.95)} 100%{transform:scale(1)} }
@keyframes juiceSquash{ 0%{transform:scale(1)} 35%{transform:scale(1.25,0.75)} 100%{transform:scale(0);opacity:0} }
.juice-pop-in { animation: juicePopIn 0.32s cubic-bezier(0.34,1.56,0.64,1) both; }
```
- **目標出現**：`juicePopIn`（0.32s，帶回彈）。
- **目標消失/被吃**：`juiceSquash`（先壓扁再縮沒）。
- **命中反應**（如小鴨被打倒）：`transform: rotate(-84deg)` ＋ `cubic-bezier(0.5,0,0.8,0.4)` 0.3s。

### 5.2 緩動曲線 (Easing) — 統一詞彙
| 用途 | 曲線 | 感覺 |
|---|---|---|
| 出現/彈入（帶回彈）| `cubic-bezier(0.34,1.56,0.64,1)` | 有彈性、可愛 |
| 呼吸/脈動 | `ease-in-out` | 柔和往復 |
| 快速消失 | `cubic-bezier(0.5,0,0.8,0.4)` | 俐落 |
| 按鈕按下 | `active:scale-95` ～ `active:scale-[0.97]` | 按了有感 |

### 5.3 螢幕震動 (Screen Shake) — `juiceRef.shake(intensity)`
- 命中：`shake(0.4)`；重擊/扣分：`shake(1)`。
- **硬上限 6px、時長 260ms**（`JuiceLayer` 內建 clamp）。**禁止超過**——長者眩暈與暈動症風險。

### 5.4 慢動作 / 頓幀 (Hit-stop) — 選用，克制
- 破紀錄或最終一擊，可對命中目標做 **80–120ms 的 hit-stop**（該物件 `animation-play-state: paused` 一瞬再放），強化打擊感。
- **禁止**用於一般命中（會拖慢節奏、長者反而困惑）。

### 5.5 目標呼吸 (Idle Pulse)
```css
@keyframes targetPulse { 0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(30,64,175,0.45)} 50%{transform:scale(1.04);box-shadow:0 0 0 16px rgba(30,64,175,0)} }
```
（＝tailwind `target-pulse`。縮放幅度 ≤ 4%，光環擴散淡出，**不改變顏色明暗頻閃**。）

### 5.6 全域 Juice 紅線（違反即砍）
- **無 >3Hz 閃爍**；亮度變化平滑。
- **震動 ≤ 6px、< 0.3s**。
- **無 Game Over／懲罰式演出**（失誤只給溫和 `−5` ＋煙霧，不紅屏、不嗶聲）。
- 尊重 `prefers-reduced-motion`：偵測到時，粒子數減半、關閉 shake 與 idle pulse（保留出現/消失的基本 pop）。

---

## 6. AI 生圖 Prompt 模板 (Copy-Paste Ready)

用途：只生**靜態底圖**（角色/道具/背景），動態爽感全交給 §4/§5 程序層。統一風格關鍵詞確保 13 款遊戲同一世界觀。輸出建議 **PNG 透明去背**（角色/道具）或 **無縫可平鋪**（背景帶）。存 `public/assets/<場景或遊戲>/`。

**共用風格關鍵詞（所有 prompt 都貼上）**：
```
stylized cartoon render, soft rounded shapes, chunky proportions, thick soft outlines,
smooth cel shading with a single soft top light, gentle ambient occlusion, glossy highlight top-left,
warm and calming palette, high contrast readable silhouette, mobile game asset, clean vector-like finish,
friendly and cozy, no harsh edges
```
**共用負面 prompt（所有 prompt 都貼上）**：
```
photorealistic, realistic skin, gritty, horror, scary, dark, low contrast, muddy colors,
harsh neon glare, flashing, text, watermark, logo, brand character, copyrighted character,
cluttered background, tiny details, thin lines, drop shadow baked in, jpeg artifacts, nsfw
```
> 生成後若底圖已含陰影，去背時一併移除烘焙陰影——落地陰影一律用 §2.1 的 `drop-shadow` 由程式加，才能跟全平台一致。

### 6.1 角色 (Character) — 例：復健農場的雞
```
A cute Q-version cartoon chicken mascot, big head short round body, large friendly eyes,
front-facing, centered, isolated on transparent background, [共用風格關鍵詞]
--negative [共用負面 prompt]
```
換角色只改第一句主體（`a chubby orange cat` / `a smiling drum` / `a round blue fish`）。

### 6.2 道具 (Prop) — 例：可切的西瓜
```
A single glossy cartoon watermelon, round and juicy, bright watermelon-red flesh hint,
isolated on transparent background, slight top-left glossy highlight, [共用風格關鍵詞]
--negative [共用負面 prompt]
```
道具需可被「切開/擊中」時，額外生一張 **切半版本**（`sliced in half, showing juicy inside`）供命中後替換。

### 6.3 背景 (Background) — 例：果園天空帶
```
A cozy cartoon orchard background, autumn sky gradient light-blue top to warm-green ground,
soft rolling hills, distant round trees, seamless horizontal tiling, no foreground clutter,
low-mid saturation so foreground targets pop, [共用風格關鍵詞]
--negative [共用負面 prompt]
```
背景需與 §2.4 天空漸層銜接：讓 AI 天空色貼近該場景 `SKY` 配方（例 orchard 天空 `#cdecff`→`#e3f4ff`）。可平鋪的雲/水/草另生「窄長無縫帶」供 SceneKit 漂移動畫用。

---

## 7. 應用對照表（既有 7 款 + 待開發節奏復能鼓）

每款列「現況畫法 → 套用重點 → 升級優先項」。**漸進升級**：先做 P1，不要求一次到位。

| 遊戲 (id) | 機制 | 現況畫法 | 套用本聖經重點 | 升級優先項 |
|---|---|---|---|---|
| **復能打地鼠** (whack-mole) | static | 已用 GalleryScene 素材＋鴨子倒下＋juicePopIn＋白光暈＋burst | 已是標竿，其他遊戲對齊它 | P2：命中改主題色噴濺（§1.3）；破紀錄加彩帶 §4 |
| **復能切切樂** (slash-fruit) | moving | OrchardScene＋burst（爆汁/煙霧）＋floatText±分＋shake | 爆汁色改「水果本色」；切中換切半底圖（§6.2）| P1：水果本色噴濺；P2：AI 生水果＋切半圖替換 emoji |
| **擦拭軌跡** (wipe-trace) | path | 路徑點陣列，偏工具感 | 軌跡加「發光拖尾＋擦亮反饋」；完成段落給 §4 星星 | P1：路徑霓虹拖尾（§1.4，暗底）＋完成脈動；統一圓角端點 |
| **抓取放置** (game) | zone | 目標區域＋抓放 | 目標區用 §2.3 呼吸光暈標「放這裡」；放對給 pop＋彩紙 | P1：放置區光暈提示；P2：AI 生容器/籃子道具 |
| **復能太空射擊** (space-shooter) | shooter | 瞄準＋三開槍模式 | 暗底＋霓虹 combo（§1.4/§2.6）；擊落用 juiceSquash | P1：擊中霓虹 burst＋combo 數字；P2：AI 生飛船/隕石 |
| **復能開心農場** (farm) | 養成 | 主題背景漸層＋emoji 作物＋商店 | 作物成熟用 juicePopIn；收成噴金幣星星；THEMES 漸層對齊 §2.4 | P2：作物三階段生長底圖（AI）；收成彩紙 |
| **復能水族箱** (aquarium) | static+養成 | 藍色漸層水族背景＋養魚圖鑑 | 氣泡＝圓潤高光球（§2.2）；餵食/長大 pop；珍珠金光暈 | P2：AI 生魚種底圖；水面光斑＋緩慢氣泡粒子 |
| **節奏復能鼓** (rhythm-drum) *待建* | rhythm | 尚無（以 static 為底加節拍）| **首發即全套上聖經**：calm/starry 暗底＋霓虹節拍呼吸（§1.4）＋beat 命中 combo 光效（§4）＋鼓面 juiceSquash＋hit-stop（§5.4）| P1（開發即做）：節拍點用 targetPulse 對齊 BPM；完美命中霓虹 burst＋金分數；背景隨節奏輕微明暗呼吸（≤3Hz） |

> **通則**：任一遊戲升級後，命中一定有「粒子＋彈跳字＋微震」三件套（§4/§5），目標一定有「呼吸光暈＋落地陰影＋圓潤高光」三件套（§2）。缺其一即未達本聖經標準。

---

## 附：與 STYLE-GUIDE.md 的分工
- **STYLE-GUIDE.md**：平台外殼（首頁/後台/兌換）的版式、字級、按鈕、文案法遵紅線。
- **ART-STYLE-BIBLE.md（本檔）**：遊戲內場景的色板、光影、粒子、juice、AI 生圖。
- 兩者衝突時：**適老可讀性 > 文案法遵 > 本聖經美感**。文案禁用詞（治癒/療效/診斷…）以 STYLE-GUIDE 為準，本檔不重述。
