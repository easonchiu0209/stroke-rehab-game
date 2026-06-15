-- 在 Supabase Dashboard → SQL Editor 執行（在 supabase-schema.sql 之後）

create or replace function increment_points(uid uuid, delta integer)
returns void language plpgsql as $$
begin
  update public.users
  set total_points = greatest(0, total_points + delta),
      updated_at   = now()
  where id = uid;
end;
$$;
