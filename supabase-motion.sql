-- ============================================================
-- Phase 1 AI 基礎建設：動作錄製 + 代償事件 + 品質指標 + 處方
-- 執行方式：Supabase Dashboard > SQL Editor 貼上執行（冪等，可重跑）
-- 對應規劃：LifeMotionXR-AI-AR-MR-開發規劃.md §3.5
-- ============================================================

-- 1) 動作原始序列（一場一列；frames 為降採樣 ~10Hz 的上半身 pose 序列）
--    frames 格式：[[t_ms, x0,y0, x7,y7, x8,y8, x11,y11, x12,y12, x13,y13,
--                   x14,y14, x15,y15, x16,y16, x23,y23, x24,y24], ...]
--    座標為 display space（鏡像已翻正）、四捨五入 3 位小數。
create table if not exists motion_frames (
  session_id   uuid primary key references game_sessions(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  landmark_ids smallint[] not null,   -- 每幀 t 之後的 landmark 順序，如 {0,7,8,11,12,13,14,15,16,23,24}
  fps          real not null default 10,
  frames       jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_motion_frames_user on motion_frames(user_id, created_at desc);

-- 2) 代償事件（一場多列；由前端規則式偵測即時產生）
--    type: 'shrug'(聳肩) | 'trunk_lean'(軀幹前傾) | 'trunk_tilt'(軀幹側彎)
create table if not exists compensation_events (
  id         bigint generated always as identity primary key,
  session_id uuid not null references game_sessions(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  t_ms       integer not null,        -- 事件開始（相對 session 開始）
  dur_ms     integer not null default 0,
  type       text not null check (type in ('shrug','trunk_lean','trunk_tilt')),
  severity   real not null default 0, -- 0–1，事件期間峰值
  created_at timestamptz not null default now()
);
create index if not exists idx_comp_events_session on compensation_events(session_id);
create index if not exists idx_comp_events_user on compensation_events(user_id, created_at desc);

-- 3) 品質指標（一場一列；存檔時由 API 以 lib/kinematics 計算 + 代償統計）
create table if not exists quality_metrics (
  session_id       uuid primary key references game_sessions(id) on delete cascade,
  user_id          uuid not null references users(id) on delete cascade,
  path_length      real,
  path_efficiency  real,   -- 0–1 越高越直接
  mean_speed       real,
  peak_speed       real,
  num_submovements integer,
  jerk_index       real,   -- 越低越平滑
  rom_x            real,   -- 0–1
  rom_y            real,
  shrug_count      integer not null default 0,
  trunk_lean_count integer not null default 0,
  trunk_tilt_count integer not null default 0,
  compensation_ms  integer not null default 0, -- 代償總時長
  created_at       timestamptz not null default now()
);
create index if not exists idx_quality_metrics_user on quality_metrics(user_id, created_at desc);

-- 4) 處方（Phase 2 治療師後台用，先建表）
create table if not exists prescriptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  therapist_id      uuid not null references users(id),
  game_type         text not null,
  target_motion     text,             -- 如 'shoulder_flexion' / 'grasp_release'
  difficulty_params jsonb,            -- 覆寫遊戲難度參數
  sessions_per_week smallint not null default 5,
  start_date        date not null default current_date,
  end_date          date,
  active            boolean not null default true,
  note              text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_prescriptions_user on prescriptions(user_id) where active;

-- RLS：全部鎖 anon（與 2026-06-18 隱私收緊政策一致），只走 service role API
alter table motion_frames       enable row level security;
alter table compensation_events enable row level security;
alter table quality_metrics     enable row level security;
alter table prescriptions       enable row level security;

-- 保留政策：動作原始序列保留 90 天（品質指標/代償事件為彙總資料，長期保留）
-- 需在 Dashboard > Database > Extensions 啟用 pg_cron 後執行下列排程：
-- select cron.schedule('purge-motion-frames', '0 18 * * *',  -- 台灣時間每天 02:00
--   $$delete from motion_frames where created_at < now() - interval '90 days'$$);
