-- ============================================================
-- ROM 量測紀錄（骨科模組核心：規格書 §6.2）
-- 執行方式：Supabase Dashboard > SQL Editor 貼上執行（冪等，可重跑）
-- ============================================================

create table if not exists rom_records (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users(id) on delete cascade,
  joint       text not null,             -- 'shoulder' / 'elbow' / 'knee' ...
  motion      text not null,             -- 'flexion' / 'abduction' ...
  angle_deg   real not null,             -- 鏡頭估算角度（非醫療量測）
  source      text not null default 'game',  -- 'game' / 'manual'
  session_id  uuid references game_sessions(id) on delete set null,
  measured_at timestamptz not null default now()
);
create index if not exists idx_rom_records_user on rom_records(user_id, joint, motion, measured_at desc);

alter table rom_records enable row level security;  -- 鎖 anon，只走 service role API
