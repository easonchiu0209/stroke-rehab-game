# LifeMotionXR 復能世界與每日冒險 v2

> 狀態：已核准方向，待實作  
> 日期：2026-07-15  
> 產品真相源：`../../LifeMotionXR-PRD.md`  
> 核心目標：把現有遊戲、處方、積分、農場與水族箱串成「每天可推進的復能世界」。

## 1. 成功體驗

玩家每天進入「晨光小鎮」，不用自行挑選遊戲，直接完成三段約 10 分鐘的冒險：

1. 暖身關：低壓力、容易成功。
2. 主訓練：治療師處方優先；無處方時由系統推薦。
3. 收尾關：節奏平穩、目標較大、結束時有完整慶祝。
4. 三關完成後開啟今日寶箱，獎勵回到農場與水族箱，小鎮累積永久成長。

沒有失敗或 Game Over。未完成的路線當天可繼續，隔日產生新路線。

## 2. 已定案的旗艦遊戲

| 遊戲 | 平台角色 | 旗艦升級重點 |
|---|---|---|
| 碰點收集 | 新手入口／暖身 | 漸進教學、活動範圍量測、第一次成功感 |
| 復能切切樂 | 爽感代表 | Combo、果汁粒子、局末水果王、個人紀錄 |
| 節奏復能鼓 | 節奏代表 | 音樂關卡、左右交替、連擊與時機回饋 |
| 復能羽球 | 對戰代表 | 對手個性、回合高潮、來回拍數與紀錄 |

農場與水族箱是養成家園，不占四款動作遊戲名額。

## 3. 經濟與世界等級

### 3.1 保留現有資源

- 平台積分 `users.total_points`：可兌換，會增加也會扣除。
- 農場金幣 `farm.coins`：農場消費。
- 水族箱珍珠 `aquarium.pearls`：水族箱消費。
- 不新增可消耗貨幣。

### 3.2 世界經驗

世界經驗 `world_xp` 是不可消耗的永久成長紀錄，不是貨幣。不能直接用 `total_points` 計算，因為積分兌換後會下降。

建議首版等級：

| 等級 | 累積 XP | 解鎖內容 |
|---|---:|---|
| Lv.1 | 0 | 晨光小屋、農場、水族箱 |
| Lv.2 | 60 | 花園區與第一組裝飾 |
| Lv.3 | 150 | 小鎮商店外觀與新道路 |
| Lv.4 | 300 | 湖畔碼頭與第二組裝飾 |
| Lv.5 | 540 | 節慶廣場與活動入口 |

每天完整完成三關共獲得 30 XP；只獎勵完成與持續，不依分數或身體能力排名。

## 4. 每日路線生成

### 暖身關

- 優先池：碰點收集、擦拭軌跡。
- 使用容易難度、大目標、較長停留時間。
- 近期有疼痛或高代償紀錄時，自動選最溫和設定。

### 主訓練

1. 有未達成本週次數的治療師處方：使用處方遊戲與難度。
2. 無處方：從四款旗艦中選擇近期較少玩的遊戲。
3. DDA 只在治療師允許的範圍內調整目標大小、位置、速度與患側比例。
4. 站立類遊戲只能由處方或已完成安全設定的使用者進入。

### 收尾關

- 優先池：復能釣魚王、彩球復能島簡單難度、碰點收集簡單難度。
- 避免與前兩關重複。
- 最後固定給完成慶祝與家園獎勵預告。

### 生成時機

- 使用者當天第一次呼叫世界 API 時生成，時區固定 `Asia/Taipei`。
- 生成後整天固定，不因重新整理或跨裝置改變。
- 治療師當天新增處方時，不改寫已開始的冒險；隔天生效。

## 5. 建議資料模型

### `world_profiles`

```sql
user_id          uuid primary key references users(id) on delete cascade
world_xp         integer not null default 0
world_level      integer not null default 1
active_theme     text not null default 'morning'
unlocked_decor   text[] not null default '{}'
equipped_decor   jsonb not null default '{}'
created_at       timestamptz not null default now()
updated_at       timestamptz not null default now()
```

### `daily_adventures`

```sql
id                uuid primary key default gen_random_uuid()
user_id           uuid not null references users(id) on delete cascade
adventure_date    date not null
plan_source       text not null -- prescription | recommendation
status            text not null default 'active'
chest_claimed_at  timestamptz
created_at        timestamptz not null default now()
unique (user_id, adventure_date)
```

### `daily_adventure_steps`

```sql
adventure_id     uuid not null references daily_adventures(id) on delete cascade
step_order       smallint not null check (step_order between 1 and 3)
role             text not null -- warmup | main | cooldown
game_type        text not null
difficulty       text not null
config           jsonb not null default '{}'
session_id       uuid references game_sessions(id)
completed_at     timestamptz
primary key (adventure_id, step_order)
```

全部開 RLS；前端只讀本人資料，生成、完成與領獎均走 server role API。

## 6. API 契約

### `GET /api/world`

一次回傳：世界等級／XP、今日三關與進度、寶箱狀態、平台積分、農場金幣、水族箱珍珠、下一個解鎖目標。

### `POST /api/world/adventure/claim`

- 僅三關都有 `session_id` 時可領。
- 以 `chest_claimed_at is null` 保證冪等。
- 首版總獎勵維持現有每日任務經濟：金幣 24、珍珠 3、世界 XP 30。
- 建議拆成每關小回饋與最終寶箱，但總量不超過現況，避免通膨。

### 遊戲結算整合

`/api/game/save`、農場與水族箱各自結算完成後，呼叫共用 `progressDailyAdventure(userId, sessionId, gameType)`：只完成「第一個符合且尚未完成」的步驟，不影響原本存檔與掉落。

## 7. 相容與遷移

1. 保留 `quest_claims`、`/api/quests` 與現有每日任務畫面作為 fallback。
2. 新世界 API 成功時使用 v2；資料表尚未套用或 API 失敗時退回 v1。
3. v2 上線後觀察兩週，再決定是否停止產生舊任務；歷史 `quest_claims` 不刪。
4. `point_logs`、`grantResources`、農場／水族箱商店與兌換匯率全部沿用。

## 8. 驗收標準

- 同一使用者跨裝置看到相同三關與進度。
- 每個遊戲場次最多完成一個冒險步驟。
- 寶箱並發點擊只發一次獎勵。
- 花掉平台積分不會降低世界等級。
- 有處方時主訓練正確採用處方，暖身與收尾不覆蓋處方。
- 未登入、API 錯誤或新表未部署時，首頁仍可使用現有遊戲入口。
- 手機 375px、平板與桌機無水平溢位，關鍵按鈕至少 44px。
- 無以準確率高低決定寶箱資格；完成即可獲得基本獎勵。

## 9. 開發順序

1. Schema 與純函式：路線生成、等級門檻、獎勵計算。
2. `GET /api/world` 與 v1 fallback。
3. 遊戲結算掛接步驟進度。
4. 寶箱冪等領獎與世界 XP。
5. 首頁改讀 v2，顯示下一個解鎖內容。
6. 單元測試、API 測試、跨裝置與手機視覺驗收。

## 10. 暫不納入

- 新遊戲、即時多人、3D 開放世界、角色捏臉。
- 第四種可消耗貨幣。
- 以分數或身體能力決定世界成長速度。
- 未經治療師允許自動安排站立與高風險動作。

## 11. P1 留存體驗 v1（2026-07-16 定案）

### 陪伴角色

- 玩家可從三位夥伴中選擇一位，選擇保存在瀏覽器並於下次進入時沿用。
- 夥伴依首次進入、今日訓練狀態、連續參與與回歸情境提供不同台詞。
- 中斷訓練時只使用「歡迎回來」等支持性文案，不清空紀錄、不顯示責備或損失。
- 偵測到 2 天以上未回來時，首頁補上一張回歸任務卡，只提示「完成 1 場」的下一步，不做清空、倒扣或補課式責備。

### 世界可見成長

- 首版以累積完成場次作為永久成長代理值，每 3 場提升一級並新增花園、橋樑或慶典裝飾。
- 成長只看完成與努力，不以準確率、分數或身體能力加速，避免能力較弱者受到雙重懲罰。
- 正式 `world_xp` API 上線後改讀不可消耗的世界經驗；可兌換平台積分只顯示資源，不參與世界等級計算。

### 家人加油站

- 首版提供同裝置可編輯的署名與一句鼓勵，保存在瀏覽器，夥伴會在首頁轉達。
- 清楚標示首版是同裝置功能，不假裝訊息來自遠端家人帳號。
- 遠端版本 v1 已有候選 schema/API：邀請碼建立關係、解除關係、單向鼓勵與患者端隱私權限；正式 Supabase 待人工套用 `supabase-family-cheer.sql`。
