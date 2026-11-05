-- 006：角色（會計 / 一般會員）與唯讀 RLS。可重複執行。
-- 必須在 001–005 之後套用；重新套用任何較舊的 migration 後，請再執行一次
--   select fund_apply_policies();
-- （否則舊檔的 *_authenticated_all 會讓所有人重新取得寫入權）。後續 007、008 結尾都會呼叫它。

create table if not exists fund_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('accountant','member')),
  created_at timestamptz not null default now()
);

alter table fund_members add column if not exists user_id uuid null references auth.users(id);

create or replace function fund_is_accountant() returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from fund_roles where user_id = auth.uid() and role = 'accountant')
$$;

-- 對所有 public.fund_% 表：登入者可讀，僅會計可寫
create or replace function fund_apply_policies() returns void language plpgsql set search_path = public as $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'fund\_%' loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s_authenticated_all" on %I', t, t);
    execute format('drop policy if exists "%s_read" on %I', t, t);
    execute format('drop policy if exists "%s_write" on %I', t, t);
    execute format('create policy "%s_read" on %I for select to authenticated using (true)', t, t);
    execute format('create policy "%s_write" on %I for all to authenticated using (fund_is_accountant()) with check (fund_is_accountant())', t, t);
  end loop;
end $$;

select fund_apply_policies();

-- seed：會計
insert into fund_roles (user_id, role)
select id, 'accountant' from auth.users
where raw_user_meta_data->>'name' in ('Steven','Eason')
on conflict do nothing;

-- 回填成員與帳號的對應
update fund_members m set user_id = u.id
from auth.users u
where m.nickname = u.raw_user_meta_data->>'name' and m.user_id is null;
