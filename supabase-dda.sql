-- ============================================================
-- DDA 難度自適應（AI 遊戲開發指引 L1）
-- 執行方式：Supabase Dashboard > SQL Editor 貼上執行（冪等，可重跑）
-- ============================================================

-- 每人每遊戲的難度狀態（場末升降級狀態機）
create table if not exists dda_state (
  user_id     uuid not null references users(id) on delete cascade,
  game_type   text not null,
  level       smallint not null default 2 check (level between 1 and 3), -- 1 easy / 2 medium / 3 hard
  streak_high smallint not null default 0,
  streak_low  smallint not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, game_type)
);
alter table dda_state enable row level security;  -- 鎖 anon，只走 service role API

-- 品質指標表補 DDA 稽核欄位
alter table quality_metrics add column if not exists performance_index real;
alter table quality_metrics add column if not exists dda_log jsonb;  -- {index, level_before, level_after}
