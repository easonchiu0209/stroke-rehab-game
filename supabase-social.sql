-- ============================================================
-- 社交系統：串門子 + 農場偷菜 + 水族箱寶物（兩輪共用一份 SQL）
-- 執行方式：Supabase Dashboard > SQL Editor 貼上執行（冪等，可重跑）
-- ============================================================

-- 社交事件（偷菜/撿寶/來訪，顯示在主人 hub 頁）
create table if not exists social_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references users(id) on delete cascade,   -- 事件的「主人」（被偷/被撿的人）
  actor_id   uuid not null references users(id) on delete cascade,   -- 做這件事的人
  type       text not null check (type in ('steal', 'pickup', 'visit')),
  payload    jsonb,          -- steal: {idx, species, coins}；pickup: {count}
  created_at timestamptz not null default now()
);
create index if not exists idx_social_events_owner on social_events(user_id, created_at desc);
create index if not exists idx_social_events_actor on social_events(actor_id, created_at desc);
alter table social_events enable row level security;

-- 農場：田地被偷標記（採收後重置；一塊田同一輪最多被偷一次 = 主人保底 70%）
alter table farm_plots add column if not exists stolen boolean not null default false;

-- 水族箱：缸底寶物（懶惰累積）
alter table aquarium add column if not exists treasures smallint not null default 0;
alter table aquarium add column if not exists last_drop_at timestamptz not null default now();
