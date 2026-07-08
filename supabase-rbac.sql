-- ============================================================
-- RBAC + 機構帳號基礎（規格書 §2/§4，B2B2C 商業化地基）
-- 執行方式：Supabase Dashboard > SQL Editor 貼上執行（冪等，可重跑）
-- ============================================================

-- 機構
create table if not exists organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  plan          text not null default 'trial',   -- trial / basic / standard / org
  seat_count    integer not null default 10,
  expires_at    date,
  branding_json jsonb,                            -- 白牌設定（Phase 2+）
  created_at    timestamptz not null default now()
);
alter table organizations enable row level security;  -- 鎖 anon

-- users 擴充：機構歸屬 + Email 登入（治療師/機構管理者）
alter table users add column if not exists org_id uuid references organizations(id);
alter table users add column if not exists email text;
alter table users add column if not exists password_hash text;
create unique index if not exists idx_users_email on users(email) where email is not null;
create index if not exists idx_users_org on users(org_id) where org_id is not null;

-- Email 建立的專業帳號沒有 LINE，line_id 改為可空（unique 索引允許多個 null）
alter table users alter column line_id drop not null;
