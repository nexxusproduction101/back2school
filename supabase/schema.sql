-- School Quest: run this first in Supabase > SQL Editor
create table if not exists profiles (
  uid uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{4,20}$'),
  role text not null check (role in ('student','teacher','institution','developer')),
  inst text,
  all_access boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists docs (
  collection text not null, id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists docs_inst_idx on docs ((data->>'inst'));
create table if not exists leases (path text primary key, holder text not null, expires_at timestamptz not null);
alter table profiles enable row level security;
alter table docs enable row level security;
alter table leases enable row level security;   -- no policies: only reachable through acquire_lease()

create or replace function me_role() returns text language sql stable security definer set search_path = public as $$ select role from profiles where uid = auth.uid() $$;
create or replace function me_user() returns text language sql stable security definer set search_path = public as $$ select username from profiles where uid = auth.uid() $$;
create or replace function me_inst() returns text language sql stable security definer set search_path = public as $$ select inst from profiles where uid = auth.uid() $$;

-- atomic lease: returns true only for one holder at a time (used so no two students get the same question in a session)
create or replace function acquire_lease(p_path text, p_holder text, p_ttl int) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return false; end if;
  insert into leases(path, holder, expires_at) values (p_path, p_holder, now() + make_interval(secs => least(greatest(p_ttl,1000),600000)/1000.0))
  on conflict (path) do update set holder = excluded.holder, expires_at = excluded.expires_at
  where leases.holder = excluded.holder or leases.expires_at < now();
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function acquire_lease(text,text,int) from public, anon;
grant execute on function acquire_lease(text,text,int) to authenticated;

-- profiles
create policy prof_read on profiles for select to authenticated using (uid = auth.uid() or me_role() = 'developer');
create policy prof_ins  on profiles for insert to authenticated with check (uid = auth.uid() and role in ('student','teacher','institution') and all_access = false);
create policy prof_dev  on profiles for all    to authenticated using (me_role() = 'developer') with check (me_role() = 'developer');

-- docs: read
create policy docs_anon_read on docs for select to anon using (collection = 'institutions');
create policy docs_read on docs for select to authenticated using (
  collection in ('catalog','institutions','tsessions','claims')
  or (collection = 'accounts' and (id = me_user() or (me_role() in ('teacher','institution') and data->>'inst' = me_inst())))
  or (collection = 'sresults' and (data->>'teacher' = me_user() or right(id, length(me_user()) + 1) = '.' || me_user()))
  or (collection = 'results' and id = auth.uid()::text)
);
-- docs: developer can do everything (catalog, questions, sessions, levels...)
create policy docs_dev on docs for all to authenticated using (me_role() = 'developer') with check (me_role() = 'developer');
-- docs: insert
create policy docs_ins on docs for insert to authenticated with check (
  (collection = 'institutions' and me_role() = 'institution' and data->>'admin' = me_user())
  or (collection = 'accounts' and id = me_user())
  or (collection = 'tsessions' and me_role() = 'teacher' and id = auth.uid()::text)
  or (collection = 'sresults' and right(id, length(me_user()) + 1) = '.' || me_user())
  or (collection = 'results' and id = auth.uid()::text)
  or collection = 'claims'
);
-- docs: update (students cannot change their own level/class after registering)
create policy docs_upd on docs for update to authenticated
using (
  (collection = 'institutions' and data->>'admin' = me_user())
  or (collection = 'accounts' and me_role() = 'institution' and data->>'inst' = me_inst())
  or (collection = 'tsessions' and me_role() = 'teacher' and id = auth.uid()::text)
  or (collection = 'sresults' and right(id, length(me_user()) + 1) = '.' || me_user())
  or (collection = 'results' and id = auth.uid()::text)
) with check (
  (collection = 'institutions' and data->>'admin' = me_user())
  or (collection = 'accounts' and me_role() = 'institution' and data->>'inst' = me_inst())
  or (collection = 'tsessions' and me_role() = 'teacher' and id = auth.uid()::text)
  or (collection = 'sresults' and right(id, length(me_user()) + 1) = '.' || me_user())
  or (collection = 'results' and id = auth.uid()::text)
);
create policy docs_del on docs for delete to authenticated using (collection = 'tsessions' and me_role() = 'teacher' and id = auth.uid()::text);

-- teaching videos (max 20 MB each, public read, only teachers/developer can upload)
insert into storage.buckets (id, name, public, file_size_limit) values ('videos','videos', true, 20971520) on conflict (id) do nothing;
create policy videos_upload on storage.objects for insert to authenticated with check (bucket_id = 'videos' and me_role() in ('teacher','developer'));
