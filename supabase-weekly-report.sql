-- ============================================================
-- LLM 週報（AI 指引 L4-5.1/5.2）
-- 執行方式：Supabase Dashboard > SQL Editor 貼上執行（冪等，可重跑）
-- ============================================================

create table if not exists weekly_reports (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references users(id) on delete cascade,
  week_start        date not null,           -- 該週週一（台灣時間）
  stats             jsonb not null,          -- 彙整後的週統計（生成輸入，可稽核）
  patient_message   text,                    -- 個案版鼓勵訊息（≤50 字）
  therapist_summary text,                    -- 治療師版數據摘要草稿
  generated_by      text not null default 'rules' check (generated_by in ('llm','rules')),
  delivered_line    boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (user_id, week_start)
);
create index if not exists idx_weekly_reports_user on weekly_reports(user_id, week_start desc);

alter table weekly_reports enable row level security;  -- 鎖 anon，只走 service role API
