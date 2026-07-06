-- ============================================================
-- 每日任務（留存三件套之三）
-- 執行方式：Supabase Dashboard > SQL Editor 貼上執行（冪等，可重跑）
-- ============================================================

-- 領獎紀錄（任務本身由日期決定性生成，不需存；只存「領過沒」）
create table if not exists quest_claims (
  user_id    uuid not null references users(id) on delete cascade,
  quest_date date not null,          -- 台灣日期
  quest_id   text not null,          -- 當日任務代號（如 play:slash-fruit / any2 / acc70）
  created_at timestamptz not null default now(),
  primary key (user_id, quest_date, quest_id)
);
alter table quest_claims enable row level security;  -- 鎖 anon，只走 service role API
