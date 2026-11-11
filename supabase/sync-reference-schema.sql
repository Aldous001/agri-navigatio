-- 同一事务写入核验导航快照和原站全量区域快照，避免一半成功。
alter table public.nav_snapshots drop constraint if exists nav_snapshots_id_check;
alter table public.nav_snapshots add constraint nav_snapshots_id_check check (id in ('current','reference'));
create or replace function public.commit_navigation_sync(
  p_payload jsonb, p_reference jsonb, p_expected_updated_at timestamptz, p_checked_at timestamptz
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if jsonb_typeof(p_payload->'models') is distinct from 'array'
     or p_reference->>'encoding' is distinct from 'gzip-base64'
     or jsonb_typeof(p_reference->'content') is distinct from 'string'
     or (p_payload->>'generated') is distinct from (p_reference->>'generated') then
    raise exception 'Invalid synchronized payload';
  end if;
  update public.nav_snapshots set payload=p_payload, updated_at=p_checked_at
  where id='current' and updated_at=p_expected_updated_at;
  if not found then raise exception 'Snapshot changed concurrently'; end if;
  insert into public.nav_snapshots(id,payload,updated_at) values('reference',p_reference,p_checked_at)
  on conflict(id) do update set payload=excluded.payload,updated_at=excluded.updated_at;
  return true;
end;
$$;
revoke all on function public.commit_navigation_sync(jsonb,jsonb,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.commit_navigation_sync(jsonb,jsonb,timestamptz,timestamptz) to service_role;
