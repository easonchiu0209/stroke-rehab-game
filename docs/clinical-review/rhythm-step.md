# 臨床審核 — 節奏踏步（rhythm-step）

> 狀態：**草稿，待臨床顧問（仲暘）簽核**。簽核前僅內部測試。

## 規格卡

```yaml
game_id: rhythm-step
name: 節奏踏步
category: neuro
clinical_goal: 下肢交替抬腿、步態節奏、左右對稱性；節拍聽覺提示（rhythmic auditory cueing）之訓練應用
target_population: 中風下肢恢復期（可安全坐姿抬腿者）、長者下肢肌力與節奏訓練；巴金森節奏提示訓練潛在適用（v2 評估）
mechanics: 跟節拍器左右輪流抬腿；拍點 ±280ms 內踏步＝踩準；60 秒/場
detection: MediaPipe Pose 髖(23/24)-膝(25/26) 垂直距離；中位數基準自動校正，距離縮至基準×liftRatio 判定抬腿、回復 88% 判定放下（遲滯防抖）
difficulty_params: BPM 50/70/90；抬腿幅度 liftRatio 0.72/0.66/0.60
metrics: 總踏步、踩準率(hits/misses→accuracy)、左右踏步數(left_hits/right_hits)→對稱性
compensation_rules: 未偵測軀幹後仰/骨盆代償——審核重點：坐姿下風險是否可接受
contraindications: 無法安全維持坐姿者、下肢急性損傷、嚴重骨質疏鬆站姿操作。站姿需陪同（已於安全須知載明）
safety: 安全須知必勾（建議坐姿、站姿需扶手/陪同、不適即停）；坐姿為預設建議
fun_layer: 大鼓節拍視覺＋節拍音、踩準彈跳字、左右腳粒子
session_structure: 單回合 60 秒；建議處方每週 3–5 次
```

## 審核 checklist（請逐項勾選）

- [ ] 判定邏輯符合動作學原理（髖膝距離代理抬腿幅度是否可接受？）
- [ ] 難度範圍對目標族群合理（BPM 50–90、幅度三段）
- [ ] 代償規則：v1 未偵測軀幹代償——可接受先上線，或必須補？
- [ ] 禁忌與警示正確且會被看到（安全須知必勾）
- [ ] 指示語言個案聽得懂（「跟著鼓聲抬腿」）
- [ ] 文案無醫療宣稱

**臨床顧問簽核**：＿＿＿＿＿＿＿＿　日期：＿＿＿＿＿＿
**審核意見／修改要求**：

