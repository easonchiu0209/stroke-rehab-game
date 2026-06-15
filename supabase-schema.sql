-- ============================================================
-- 復能遊戲平台 Supabase Schema
-- 在 Supabase Dashboard → SQL Editor 貼上執行
-- ============================================================

-- 使用者表
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  line_id       text unique not null,
  display_name  text not null,
  picture_url   text,
  total_points  integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 遊戲場次記錄
create table if not exists public.game_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  game_type       text not null,   -- 'whack-mole' | 'slash-fruit' | ...
  difficulty      text not null,   -- 'easy' | 'medium' | 'hard'
  score           integer not null default 0,
  hits            integer not null default 0,
  misses          integer not null default 0,
  accuracy        integer not null default 0,   -- 0-100
  avg_reaction_ms integer,
  highest_reach   integer,         -- 0-100%
  left_hits       integer not null default 0,
  right_hits      integer not null default 0,
  center_hits     integer not null default 0,
  duration_secs   integer not null default 60,
  points_earned   integer not null default 0,
  created_at      timestamptz not null default now()
);

-- 積分流水帳
create table if not exists public.point_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  amount      integer not null,   -- 正數=獲得, 負數=消耗
  source      text not null,      -- 'game' | 'achievement' | 'redeem' | 'bonus'
  description text,
  session_id  uuid references public.game_sessions(id),
  created_at  timestamptz not null default now()
);

-- 成就定義
create table if not exists public.achievements (
  id              text primary key,  -- 'first_hit', 'streak_5', ...
  name            text not null,
  description     text not null,
  icon            text not null,     -- emoji
  condition_type  text not null,     -- 'total_hits' | 'total_sessions' | 'accuracy' | 'streak'
  condition_value integer not null,
  points_bonus    integer not null default 0,
  created_at      timestamptz not null default now()
);

-- 使用者成就
create table if not exists public.user_achievements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  achievement_id text not null references public.achievements(id),
  earned_at      timestamptz not null default now(),
  unique(user_id, achievement_id)
);

-- 獎品目錄
create table if not exists public.prizes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  image_emoji   text not null default '🎁',
  points_cost   integer not null,
  stock         integer,           -- null = 無限量
  category      text not null default 'physical',  -- 'physical' | 'digital' | 'unlock'
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- 兌換記錄
create table if not exists public.redemptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  prize_id    uuid not null references public.prizes(id),
  points_spent integer not null,
  status      text not null default 'pending',  -- 'pending' | 'approved' | 'rejected' | 'delivered'
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── 預設成就資料 ─────────────────────────────────────────────

insert into public.achievements (id, name, description, icon, condition_type, condition_value, points_bonus) values
  ('first_game',    '初次出發',   '完成第一場遊戲',           '🌱', 'total_sessions', 1,  50),
  ('hits_10',       '小試身手',   '累計成功觸碰 10 次',        '👊', 'total_hits',     10, 30),
  ('hits_50',       '穩健出擊',   '累計成功觸碰 50 次',        '💪', 'total_hits',     50, 80),
  ('hits_200',      '復能達人',   '累計成功觸碰 200 次',       '🏆', 'total_hits',     200,200),
  ('sessions_7',    '一週挑戰',   '完成 7 場訓練',             '📅', 'total_sessions', 7,  100),
  ('sessions_30',   '月度勇士',   '完成 30 場訓練',            '🦁', 'total_sessions', 30, 300),
  ('accuracy_80',   '精準射手',   '任一場命中率達 80% 以上',   '🎯', 'accuracy',       80, 50),
  ('accuracy_95',   '百發百中',   '任一場命中率達 95% 以上',   '⭐', 'accuracy',       95, 150),
  ('reach_80',      '高手出現',   '伸手高度達螢幕 80% 以上',   '🙌', 'highest_reach',  80, 60)
on conflict (id) do nothing;

-- ── 預設獎品資料 ─────────────────────────────────────────────

insert into public.prizes (name, description, image_emoji, points_cost, category) values
  ('復健小英雄徽章',  '虛擬徽章，顯示於個人頁面',     '🏅', 100,  'digital'),
  ('超級復能者稱號',  '專屬稱號，顯示於排行榜',       '👑', 300,  'digital'),
  ('7-11 禮品卡 50元', '實體禮品卡，由工作人員發放',  '🎫', 500,  'physical'),
  ('運動毛巾',       '復健運動紀念毛巾',              '🏋️', 800,  'physical'),
  ('進階關卡解鎖',   '解鎖更多遊戲關卡與模式',        '🔓', 200,  'unlock')
on conflict do nothing;

-- ── RLS (Row Level Security) ──────────────────────────────────

alter table public.users           enable row level security;
alter table public.game_sessions   enable row level security;
alter table public.point_logs      enable row level security;
alter table public.user_achievements enable row level security;
alter table public.redemptions     enable row level security;
alter table public.achievements    enable row level security;
alter table public.prizes          enable row level security;

-- 公開可讀成就和獎品
create policy "achievements_public_read" on public.achievements for select using (true);
create policy "prizes_public_read"       on public.prizes       for select using (is_active = true);

-- 排行榜：所有人可讀 users 基本資訊
create policy "users_public_read" on public.users
  for select using (true);

-- 使用者只能讀寫自己的資料（由 service role 寫入，前端只讀）
create policy "sessions_own_read" on public.game_sessions
  for select using (true);
create policy "point_logs_own_read" on public.point_logs
  for select using (true);
create policy "achievements_own_read" on public.user_achievements
  for select using (true);
create policy "redemptions_own_read" on public.redemptions
  for select using (true);
