-- ============================================================
-- 疼痛 NRS 回合回報（骨科模組必備：規格書 §6.2 O1）
-- 執行方式：Supabase Dashboard > SQL Editor 貼上執行（冪等，可重跑）
-- ============================================================

alter table game_sessions add column if not exists pain_score smallint
  check (pain_score is null or (pain_score >= 0 and pain_score <= 10));
