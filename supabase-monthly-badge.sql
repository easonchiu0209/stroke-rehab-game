-- ============================================================
-- 月度挑戰徽章（活動限定層）：當月訓練滿 20 天 → 限定徽章（過期不補、永久保留）
-- 執行方式：Supabase Dashboard > SQL Editor 貼上執行（冪等，可重跑）
-- ============================================================

create table if not exists monthly_badges (
  user_id      uuid not null references users(id) on delete cascade,
  month        text not null,              -- 'YYYY-MM'（台灣時間）
  days_trained smallint not null,
  earned_at    timestamptz not null default now(),
  primary key (user_id, month)
);
alter table monthly_badges enable row level security;  -- 鎖 anon，只走 service role API
