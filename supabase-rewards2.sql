-- ============================================================
-- 獎勵體系第二波：榮譽層（稱號/頭像框）+ 收藏（驚喜蛋限定裝飾）
-- 執行方式：Supabase Dashboard > SQL Editor 貼上執行（冪等，可重跑）
-- ============================================================

alter table users add column if not exists title text;          -- 稱號（顯示於社群/排行榜名旁）
alter table users add column if not exists avatar_frame text;   -- 頭像框 bronze/silver/gold
alter table users add column if not exists owned_items jsonb not null default '[]'::jsonb;  -- 收藏（裝飾等）
