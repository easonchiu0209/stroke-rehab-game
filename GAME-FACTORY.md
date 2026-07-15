# LifeMotionXR 遊戲工廠契約 (Game Factory Contract)

> 自動生成遊戲的「規格書」。多代理 Workflow 的每個子代理產生新遊戲時，**必須**遵守本契約，
> 以確保產出的程式碼風格一致、可編譯、能存進後端、能在首頁出現。

## 0. 名詞
- **spec（遊戲規格）**：一款遊戲的定義（見 §2），由 PM/使用者先核可，才交給生成器。
- **mechanic（機制/引擎）**：底層 AR 偵測引擎。現有 4 種 + 1 種待建（見 §1）。
- **reference（參考實作）**：每種機制都有一個現成遊戲當範本，生成新遊戲時**複製最接近的範本再改**。

## 1. 機制 → 參考遊戲 → Hook
| mechanic | 參考遊戲 (clone 它) | 偵測 hook | 目標資料結構 |
|----------|--------------------|-----------|--------------|
| `static`  | `app/whack-mole/page.tsx` | `useMoleDetector` | MoleTarget {id,nx,ny,spawnTime,expireAt,cssRadius} |
| `moving`  | `app/slash-fruit/page.tsx` | `useSlashDetector` | SlashTarget {id,x0,y0,vx,vy,gravity,spawnTime,hitRadiusPx,visualEm,type,emoji} |
| `path`    | `app/wipe-trace/page.tsx` | `useTraceDetector` | 路徑點陣列 |
| `zone`    | `app/game/page.tsx`（抓取放置）| `useZoneDetector` | 目標區域 |
| `rhythm`  | `app/rhythm-drum/page.tsx` | `useMoleDetector` + 節拍邏輯 | 同 static + beatTime（拍點時間窗判定） |
| `shooter` | `app/space-shooter/page.tsx` | `useShooterDetector` | ShooterTarget {id,x0,y0,vx,vy,spawnTime,hitRadiusPx,visualEm,type,emoji}；瞄準＝食指尖，三種開槍模式 touch/dwell/pinch 對應三難度 |

共用底層（所有遊戲都用）：`useHandLandmarker()`（模型）、`useCamera(videoRef)`（鏡頭、isMirrored）。

## 2. 遊戲規格格式 (spec)
每款遊戲是一個物件，欄位如下：
```ts
{
  id:          string   // 路由與 game_type，kebab-case，例 'farm-harvest'
  title:       string   // 中文名，例 '復能小農場'
  emoji:       string   // 首頁卡片圖示
  subtitle:    string   // 訓練主軸，例 '肩屈曲與抓握'
  description: string   // 一句玩法說明
  mechanic:    'static' | 'moving' | 'path' | 'zone' | 'rhythm'
  theme: {              // 視覺主題（換皮用）
    targetEmojis: string[]   // 目標圖示，例 ['🐔','🐮','🥕','🌽']
    badEmojis?:   string[]   // 扣分目標，例 ['🐛']（可無）
    bg:           string     // Tailwind 背景，例 'bg-amber-950'
  }
  rehab: {              // 復健目標（決定難度/出現區域）
    joint:  string      // '肩' | '肘' | '腕' | '複合'
    motion: string      // 例 '肩外展'、'前伸搆取'
    level:  string      // 'Level 1–3' 等
  }
  difficulty: {         // 三段難度，照參考遊戲的 Cfg 欄位填
    easy:   Partial<Cfg>
    medium: Partial<Cfg>
    hard:   Partial<Cfg>
  }
  available: boolean    // 是否在首頁可玩
}
```

## 3. 生成規則（子代理必須遵守）
1. **檔案位置**：`app/<id>/page.tsx`，單檔自包含（照參考遊戲，不拆元件）。
2. **複製最近範本**：依 `mechanic` 複製 §1 對應的參考遊戲，只改：難度 Cfg、主題 emoji/背景、出現區域（依 rehab）、文案、`game_type`。**不要重寫引擎或 hook。**
3. **鏡頭/畫布**：沿用範本的 inline `<video>`+`<canvas>`。⚠️ **鏡頭方向**：一律用前鏡頭並動態鏡像——`startCamera('user')`、從 useCamera 取 `isMirrored`、video/canvas 用 `transform: isMirrored ? 'scaleX(-1)' : undefined`、detector 傳動態 `isMirrored`（**不要寫死 `scaleX(-1)` 或 `isMirrored: true`**，那會在手機抓到後鏡頭並翻轉，方向全錯）。對齊 `whack-mole` 的寫法。
4. **狀態機**：維持 `config → countdown → playing → ended/results` 三階段。
5. **存檔**：結束時 POST `/api/game/save`，payload 必含 `game_type=<id>`、`difficulty`、`score`、`hits`、`misses`，盡量補 `avg_reaction_ms`、`highest_reach`、`left_hits/right_hits/center_hits`、`duration_secs`。
6. **首頁註冊**：在 `app/page.tsx` 的 `GAMES` 陣列加一筆 `GameCardData`（id/emoji/title/subtitle/level/levelBadge/description/route=`/<id>`/available）。
7. **名稱/輪替註冊（四處都要）**：`app/profile/page.tsx` 的 `GAME_NAMES`、`lib/gameInfo.ts` 的 `GAME_INFO`、`lib/quests.ts` 的 `ROTATION`（每日任務輪替池）、`app/therapist/page.tsx` 的名稱表，各加 `'<id>'` 一筆。
8. **語言**：所有 UI 文案用繁體中文，風格對齊現有遊戲（鼓勵、長者友善）。
9. **美術對齊（必做）**：視覺一律遵 `ART-STYLE-BIBLE.md`（統一色板／光影／形狀／粒子／juice）。目標物必備「呼吸光暈＋落地陰影＋圓潤高光」三件套；命中必備「粒子 `burst`＋彈跳字 `floatText`＋微震 `shake`」三件套（皆走共用 `components/game/JuiceLayer.tsx`，不自造）。色彩取聖經 §1 色板，動畫數值取 §5，適老紅線（無 >3Hz 閃爍、震動 ≤6px、無懲罰演出）不可違反。需 AI 生底圖時，用聖經 §6 prompt 模板（含共用風格＋負面關鍵詞），存 `public/assets/<id>/`（目錄需先建立，見聖經 §6）。流程順序：spec 規格核可（本契約 §6 核可清單）→ 開發 → 開發中即遵聖經 §1–6 做視覺，不是做完再補。

## 4. 驗證 + 自動除錯（Workflow 的除錯階段）
每生成一款後，在 `stroke-rehab-game/` 執行：
```
npx tsc --noEmit          # 型別檢查（最重要）
npm run build             # Next 編譯（完整驗證）
```
- 有錯 → 把錯誤訊息 + 出錯檔案內容餵回修正步驟，改完重跑，最多 3 輪。
- 全綠才算這款完成。

## 5. 部署
全部通過後（或每款通過後）在 `stroke-rehab-game/` 執行 `vercel --prod --yes`。

## 6. 規格現況（待 PM/使用者核可後才生成）
見根目錄 `LifeMotionXR-PRD.md` 與下一節核可清單。核可的 spec 會列在這裡。

### 已核可待生成（下一波）：
- 復能釣魚王 (fishing-king, static) — 復能小精靈 (sprite-collect, moving) — 復能彈弓手 (slingshot, moving)
- 復能小火車 (train-track, path) — 復能小巴士 (bus-route, path)
- 復能守護村 (guard-village, zone) — 復能積木村 (block-build, zone) — 復能生活任務 (daily-tasks, zone)
- 復能採蘋果 (apple-pick, static) — 復能擦窗戶 (window-wipe, path)

### 已生成上線：
- 復能打地鼠 (whack-mole, static)
- 復能切切樂 (slash-fruit, moving)
- 擦拭軌跡 (wipe-trace, path)
- 抓取放置 (game, zone)
- 碰點收集 (touch-collect, static)
- 彩球復能島 (color-island, moving) — 2026-06-18 第一波
- 復能小廚房 (kitchen-catch, moving) — 2026-06-18 第一波
- 復能太空射擊 (space-shooter, shooter — 新引擎) — 2026-06-18：瞄準＋三種開槍模式（碰/停留/捏合）對應三難度。
- 復能釣魚王 (fishing-king, static) — 2026-06-18：目標偏下方，練前伸/向下搆取。（快玩版，仍可用 /fishing-king）
- 復能水族箱 (aquarium, static + 養成) — 2026-06-18：釣魚 AR + 持久養魚（魚會長大產珍珠、解鎖魚種、擴缸、圖鑑）。表 aquarium/aquarium_fish，lib/aquarium.ts，API /api/aquarium(+shop)。首頁卡片由釣魚王改為水族箱。
- 復能開心農場 (farm, 養成系統) — 2026-06-18：把 farm-harvest + pet-pat 合併升級成持久養成（種→長→收、金幣、商店、AR 照顧 session）。不是換皮，是自訂功能；資料表 farm / farm_plots，API /api/farm 與 /api/farm/shop，定義在 lib/farm.ts。舊的 farm-harvest、pet-pat 頁面已刪除。
- 夾取分類 (pinch-sort, pinch — 精細動作) — 2026-06-26
- 重心平衡 (balance-shift, pose — 站姿) — 2026-06-26：Pose 重心偵測＋安全須知頁。
- 爬牆挑戰 (wall-climb, pose — 骨科 O1) — 2026-07-07：肩角度估算＋ROM 落庫＋疼痛 NRS。⚠️ 臨床審核待簽（見 §8）。
- 節奏踏步 (rhythm-step, pose — 神經 N1 下肢) — 2026-07-07：節拍器＋抬腿偵測＋左右對稱。⚠️ 臨床審核待簽（見 §8）。
- 節奏復能鼓 (rhythm-drum, rhythm — 新引擎首發) — 2026-07-14：霓虹音符落鼓面＋拍點時間窗判定＋雙側交替（hard 含中央跨中線）。視覺照聖經 §7 全套（calm 暗底＋霓虹色板＋節拍呼吸）。⚠️ 臨床審核待簽（見 §8）。

## 7. 遊戲規格卡（新遊戲必填 — AI 指引 B 篇）

每款新遊戲生成前先填一張規格卡（yaml），與程式一起 commit 到 `docs/clinical-review/<id>.md`：

```yaml
game_id:              # 例 wall-climb
name:                 # 中文名
category: neuro|ortho|cardio|peds
clinical_goal:        # 訓練什麼能力，對應哪個臨床概念
target_population:    # 適用對象與分期（Brunnstrom / 術後週數等）
mechanics:            # 玩法一段話
detection:            # 用哪些關節點、判定邏輯（角度/速度/節奏/位置）
difficulty_params:    # 可調參數與範圍
metrics:              # 存入哪些指標欄位
compensation_rules:   # 代償偵測規則（無則寫「沿用全域 usePoseMonitor」或「不適用+原因」）
contraindications:    # 禁忌與警示條件
safety:               # 安全設計（坐姿/防跌/疼痛回報/角度上限）
fun_layer:            # 視覺主題、juice、音效方向
session_structure:    # 回合長度、休息、總時長
```

## 8. 臨床審核 checklist（上線前必過 — 臨床顧問簽核）

新遊戲（或判定邏輯有變的舊遊戲）在開放給個案前，臨床顧問逐項簽核：

- [ ] 判定邏輯符合動作學原理
- [ ] 難度範圍對目標族群合理
- [ ] 代償規則完整（或不適用的理由成立）
- [ ] 禁忌與警示正確且會被看到
- [ ] 指示語言個案聽得懂（長者視角）
- [ ] 文案無醫療宣稱（對照 STYLE-GUIDE.md 禁用詞）

簽核紀錄存 `docs/clinical-review/<id>.md`（規格卡＋checklist＋簽名/日期）。
**現況**：wall-climb 與 rhythm-step 的審核草稿已備（待仲暘簽核），簽核前建議僅內部測試、不主動推廣給個案。

## 9. 灰度上架

臨床簽核後：先開 `available: true` 給 1–2 家友好機構試 2 週（觀察依從率、疼痛回報、治療師回饋），再全量放到首頁推薦位。
