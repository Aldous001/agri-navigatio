begin;
create table if not exists public.nav_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.nav_snapshots (
  id text primary key check (id = 'current'),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.nav_members enable row level security;
alter table public.nav_snapshots enable row level security;
revoke all on public.nav_members, public.nav_snapshots from anon, authenticated;
grant select on public.nav_members, public.nav_snapshots to authenticated;
grant all on public.nav_members, public.nav_snapshots to service_role;
drop policy if exists member_self on public.nav_members;
create policy member_self on public.nav_members for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists member_data on public.nav_snapshots;
create policy member_data on public.nav_snapshots for select to authenticated
  using (exists(select 1 from public.nav_members m where m.user_id = (select auth.uid()) and m.enabled));
commit;
