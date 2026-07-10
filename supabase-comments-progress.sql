-- ============================================================
-- 社群留言 + AI 進步追蹤（AI 指引 L2）
-- 執行方式：Supabase Dashboard > SQL Editor 貼上執行（冪等，可重跑）
-- ============================================================

-- 貼文留言
create table if not exists post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_post_comments_post on post_comments(post_id, created_at);
alter table post_comments enable row level security;

-- AI 進步追蹤：每週掃描各維度趨勢（進步/持平/退步 + 平原期/退步警示旗標）
create table if not exists progress_insights (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users(id) on delete cascade,
  computed_at date not null,
  dimension   text not null,   -- accuracy | reaction | rom_y | smoothness
  trend       text not null,   -- improving | flat | declining | insufficient
  delta       real,            -- 近 4 週變化量（維度各自單位）
  flag        text,            -- plateau | decline_alert | null
  detail      jsonb,
  unique (user_id, computed_at, dimension)
);
create index if not exists idx_progress_insights_user on progress_insights(user_id, computed_at desc);
alter table progress_insights enable row level security;
