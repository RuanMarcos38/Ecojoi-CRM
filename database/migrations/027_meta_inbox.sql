-- Reuses the server-only integration_events ledger. Historical events remain completed.
begin;
alter table public.integration_events add column if not exists processing_status text not null default 'completed',
 add column if not exists inbound_payload jsonb, add column if not exists attempts integer not null default 0,
 add column if not exists max_attempts integer not null default 5,
 add column if not exists next_attempt_at timestamptz not null default now(),
 add column if not exists locked_at timestamptz, add column if not exists lease_token uuid,
 add column if not exists last_error text, add column if not exists processed_at timestamptz;
alter table public.integration_events drop constraint if exists integration_events_processing_status_check;
alter table public.integration_events add constraint integration_events_processing_status_check
 check(processing_status in ('pending','processing','completed','failed','dead_letter'));
create index if not exists integration_events_inbox_due_idx on public.integration_events(next_attempt_at)
 where provider='meta' and processing_status in ('pending','failed','processing');
revoke all on public.integration_events from anon,authenticated;
create or replace function public.crm_claim_meta_events(p_limit integer default 25,p_tenant_id uuid default null)
returns setof public.integration_events language sql security definer set search_path=pg_catalog,public as $$
 with exhausted as (
 update public.integration_events set processing_status='dead_letter',locked_at=null,lease_token=gen_random_uuid(),last_error='inbound_attempt_limit'
 where provider='meta' and (p_tenant_id is null or tenant_id=p_tenant_id) and attempts>=max_attempts
 and (processing_status in ('pending','failed') or (processing_status='processing' and locked_at<now()-interval '5 minutes')) returning id
 ),due as (
 select id from public.integration_events
 where provider='meta' and (p_tenant_id is null or tenant_id=p_tenant_id) and inbound_payload is not null and attempts<max_attempts
 and ((processing_status in ('pending','failed') and next_attempt_at<=now())
 or(processing_status='processing' and locked_at<now()-interval '5 minutes'))
 order by next_attempt_at,id limit greatest(1,least(50,p_limit)) for update skip locked
 )
 update public.integration_events e set processing_status='processing',attempts=e.attempts+1,locked_at=now(),lease_token=gen_random_uuid()
 from due where e.id=due.id returning e.*;
$$;
revoke all on function public.crm_claim_meta_events(integer,uuid) from public,anon,authenticated;
grant execute on function public.crm_claim_meta_events(integer,uuid) to service_role;
commit;

