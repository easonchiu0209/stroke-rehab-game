-- ============================================================
-- LifeMotionXR 遠端家人鼓勵 v1 候選 schema
-- 用途：邀請關係、解除關係、單向鼓勵、隱私權限
-- 狀態：候選差異，等待人工確認後再套用到正式 Supabase
-- ============================================================

create table if not exists public.family_cheer_links (
  id                  uuid primary key default gen_random_uuid(),
  patient_user_id     uuid not null references public.users(id) on delete cascade,
  supporter_user_id   uuid references public.users(id) on delete cascade,
  invite_code         text not null unique,
  status              text not null default 'pending', -- pending | active | revoked
  allow_name_share    boolean not null default true,
  allow_picture_share boolean not null default false,
  allow_progress_share boolean not null default false,
  allow_alerts_share   boolean not null default true,
  patient_note        text,
  supporter_note      text,
  accepted_at         timestamptz,
  revoked_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint family_cheer_links_status_check
    check (status in ('pending', 'active', 'revoked')),
  constraint family_cheer_links_pair_unique
    unique (patient_user_id, supporter_user_id)
);

create index if not exists family_cheer_links_patient_status_idx
  on public.family_cheer_links (patient_user_id, status);

create index if not exists family_cheer_links_supporter_status_idx
  on public.family_cheer_links (supporter_user_id, status);

create unique index if not exists family_cheer_links_one_active_patient_idx
  on public.family_cheer_links (patient_user_id)
  where status in ('pending', 'active');

create table if not exists public.family_cheer_messages (
  id                uuid primary key default gen_random_uuid(),
  link_id           uuid not null references public.family_cheer_links(id) on delete cascade,
  sender_user_id    uuid not null references public.users(id) on delete cascade,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  message           text not null,
  created_at        timestamptz not null default now()
);

create index if not exists family_cheer_messages_link_created_idx
  on public.family_cheer_messages (link_id, created_at desc);

alter table public.family_cheer_links enable row level security;
alter table public.family_cheer_messages enable row level security;

drop policy if exists family_cheer_links_select on public.family_cheer_links;
create policy family_cheer_links_select on public.family_cheer_links
  for select using (
    auth.uid() = patient_user_id or auth.uid() = supporter_user_id
  );

drop policy if exists family_cheer_links_insert on public.family_cheer_links;
create policy family_cheer_links_insert on public.family_cheer_links
  for insert with check (
    auth.uid() = patient_user_id
  );

drop policy if exists family_cheer_links_update on public.family_cheer_links;
create policy family_cheer_links_update on public.family_cheer_links
  for update using (
    auth.uid() = patient_user_id or auth.uid() = supporter_user_id
  ) with check (
    auth.uid() = patient_user_id or auth.uid() = supporter_user_id
  );

drop policy if exists family_cheer_messages_select on public.family_cheer_messages;
create policy family_cheer_messages_select on public.family_cheer_messages
  for select using (
    exists (
      select 1
      from public.family_cheer_links l
      where l.id = link_id
        and (auth.uid() = l.patient_user_id or auth.uid() = l.supporter_user_id)
    )
  );

drop policy if exists family_cheer_messages_insert on public.family_cheer_messages;
create policy family_cheer_messages_insert on public.family_cheer_messages
  for insert with check (
    exists (
      select 1
      from public.family_cheer_links l
      where l.id = link_id
        and l.status = 'active'
        and auth.uid() = sender_user_id
        and auth.uid() = l.supporter_user_id
        and recipient_user_id = l.patient_user_id
    )
  );
