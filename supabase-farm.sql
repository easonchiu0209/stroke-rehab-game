-- ============================================================
-- 復能開心農場 Schema（在既有 schema 之後執行）
-- ============================================================

-- 每位使用者一筆農場狀態
create table if not exists public.farm (
  user_id     uuid primary key references public.users(id) on delete cascade,
  level       integer not null default 1,
  coins       integer not null default 30,           -- 農場金幣（與平台積分分開）
  plot_count  integer not null default 9,            -- 田地數量
  unlocked    text[]  not null default array['carrot','corn','chicken']::text[], -- 已解鎖物種
  total_harvest integer not null default 0,          -- 累計採收數（升級用）
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 每塊田地
create table if not exists public.farm_plots (
  user_id    uuid not null references public.users(id) on delete cascade,
  idx        integer not null,                       -- 田地位置 0..plot_count-1
  kind       text not null default 'empty',          -- 'crop' | 'animal' | 'empty'
  species    text,                                   -- 'carrot' | 'corn' | 'chicken' ...
  stage      integer not null default 0,             -- 成長階段（0=種子；達物種的 ripeStage 即成熟）
  updated_at timestamptz not null default now(),
  primary key (user_id, idx)
);

-- RLS：本人可讀（寫入一律走 service role API）
alter table public.farm        enable row level security;
alter table public.farm_plots  enable row level security;
create policy "farm_own_read"       on public.farm       for select using (true);
create policy "farm_plots_own_read" on public.farm_plots for select using (true);
