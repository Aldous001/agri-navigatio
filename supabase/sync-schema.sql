-- 云端每日同步日志；不向普通账号或匿名访问者开放。
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create table if not exists public.nav_sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  status text not null check (status in ('success','failed')),
  source_generated text,
  model_count integer,
  error text
);
alter table public.nav_sync_runs enable row level security;
revoke all on public.nav_sync_runs from anon, authenticated;
grant select,insert on public.nav_sync_runs to service_role;
grant usage,select on sequence public.nav_sync_runs_id_seq to service_role;
