# 臨床審核 — 爬牆挑戰（wall-climb）

> 狀態：**草稿，待臨床顧問（仲暘）簽核**。簽核前僅內部測試。

## 規格卡

```yaml
game_id: wall-climb
name: 爬牆挑戰
category: ortho
clinical_goal: 肩關節主動活動度（屈曲/外展），對應五十肩、肩部術後之漸進 ROM 訓練與 wall-climbing exercise 數位化
target_population: 沾黏性肩關節囊炎、旋轉肌袖術後恢復期（醫囑允許主動活動後）、中風個案肩關節活動維持
mechanics: 抬手帶動登山者沿牆上爬；抬到目標角度停留（terminal hold）＝登頂一次；放回身側（<40°）才計下一次，強制完整 ROM 循環
detection: MediaPipe Pose 肩(11/12)-肘(13/14)-髖(23/24)；肩→肘向量與肩→髖向量夾角＝抬升角度估算；雙側取可見度達標之較大值；EMA 平滑
difficulty_params: 目標角度 90/120/150°、停留 1–1.5 秒；60 秒/場
metrics: 登頂次數(hits)、本場最大角度→rom_records(shoulder/flexion)、highest_reach、疼痛 NRS(pain_score)
compensation_rules: 本遊戲不掛全域 usePoseMonitor（同一 Pose 單例衝突）；軀幹側彎代償「未偵測」——審核重點：是否需在 v2 補（例如軀幹傾斜>15° 提示）
contraindications: 肩部急性疼痛/發炎期、術後未達主動活動醫囑、頸椎不穩定。處方角度上限功能尚未實作（backlog），審核請評估是否為上線前必要條件
safety: 結算疼痛 NRS 0–10 必問（≥4 警語＋建議暫停）；UI 標示「鏡頭估算非醫療量測」；文案無醫療宣稱
fun_layer: 登山主題、破紀錄慶祝（juice）、登頂語音鼓勵
session_structure: 單回合 60 秒，無強制次數；建議處方每週 3–5 次
```

## 審核 checklist（請逐項勾選）

- [ ] 判定邏輯符合動作學原理（2D 夾角估算是否可接受為訓練回饋？）
- [ ] 難度範圍對目標族群合理（90/120/150° 三段是否恰當？）
- [ ] 代償規則：v1 未偵測軀幹代償——可接受先上線，或必須補？
- [ ] 禁忌與警示正確且會被看到（config 頁警語、疼痛回報）
- [ ] 指示語言個案聽得懂
- [ ] 文案無醫療宣稱

**臨床顧問簽核**：＿＿＿＿＿＿＿＿　日期：＿＿＿＿＿＿
**審核意見／修改要求**：

