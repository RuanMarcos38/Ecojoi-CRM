-- Ecojoi CRM - API rate limiting e busca global indexada.
create extension if not exists pg_trgm;

create index if not exists contacts_name_trgm_idx on public.contacts using gin (name gin_trgm_ops);
create index if not exists contacts_email_trgm_idx on public.contacts using gin (email gin_trgm_ops);
create index if not exists contacts_phone_trgm_idx on public.contacts using gin (phone gin_trgm_ops);
create index if not exists messages_body_trgm_idx on public.messages using gin (body gin_trgm_ops);
create index if not exists deals_title_trgm_idx on public.deals using gin (title gin_trgm_ops);
create index if not exists tasks_title_trgm_idx on public.tasks using gin (title gin_trgm_ops);

create table if not exists public.api_rate_usage (
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  bucket_start timestamptz not null,
  request_count integer not null default 0,
  primary key(api_key_id,bucket_start)
);

alter table public.api_rate_usage enable row level security;
revoke all on table public.api_rate_usage from anon,authenticated;
grant select,insert,update,delete on table public.api_rate_usage to service_role;

drop policy if exists api_rate_service_role on public.api_rate_usage;
create policy api_rate_service_role on public.api_rate_usage
for all to service_role using (true) with check (true);

create or replace function public.consume_api_rate(
  p_api_key_id uuid,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_bucket timestamptz := date_trunc('minute',now());
  v_count integer;
begin
  insert into public.api_rate_usage(api_key_id,bucket_start,request_count)
  values(p_api_key_id,v_bucket,1)
  on conflict(api_key_id,bucket_start)
  do update set request_count=public.api_rate_usage.request_count+1
  returning request_count into v_count;

  delete from public.api_rate_usage
  where bucket_start < now()-interval '2 hours';

  return v_count <= greatest(1,p_limit);
end;
$$;

revoke all on function public.consume_api_rate(uuid,integer) from public,anon,authenticated;
grant execute on function public.consume_api_rate(uuid,integer) to service_role;
