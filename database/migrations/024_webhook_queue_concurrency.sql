-- Ecojoi only. Additive queue hardening; no credentials or customer records changed.
begin;
alter table public.webhook_deliveries add column if not exists locked_at timestamptz,
 add column if not exists lease_token uuid, add column if not exists duration_ms integer;
alter table public.webhook_deliveries drop constraint if exists webhook_deliveries_status_check;
alter table public.webhook_deliveries add constraint webhook_deliveries_status_check
 check(status in ('pending','processing','sent','failed','dead_letter','ignored'));
create index if not exists webhook_deliveries_processing_lease_idx
 on public.webhook_deliveries(locked_at) where status='processing';

create or replace function public.crm_claim_webhook_deliveries(p_limit integer default 25,p_tenant_id uuid default null)
returns setof public.webhook_deliveries language sql security definer set search_path=pg_catalog,public as $$
 with exhausted as (
  update public.webhook_deliveries set status='dead_letter',locked_at=null,lease_token=gen_random_uuid(),error='delivery_attempt_limit'
  where (p_tenant_id is null or tenant_id=p_tenant_id) and attempts>=max_attempts
   and (status in ('pending','failed') or (status='processing' and locked_at<now()-interval '5 minutes'))
  returning id
 ), due as (
  select d.id from public.webhook_deliveries d
  where (p_tenant_id is null or d.tenant_id=p_tenant_id)
   and ((d.status in ('pending','failed') and d.next_attempt_at<=now() and d.attempts<d.max_attempts)
    or (d.status='processing' and d.locked_at<now()-interval '5 minutes' and d.attempts<d.max_attempts))
  order by d.next_attempt_at,d.id limit greatest(1,least(100,p_limit)) for update skip locked
 )
 update public.webhook_deliveries d set status='processing',attempts=d.attempts+1,
 locked_at=now(),lease_token=gen_random_uuid() from due where d.id=due.id returning d.*;
$$;
revoke all on function public.crm_claim_webhook_deliveries(integer,uuid) from public,anon,authenticated;
grant execute on function public.crm_claim_webhook_deliveries(integer,uuid) to service_role;
alter table public.outbound_message_queue add column if not exists lease_token uuid;
create or replace function public.crm_claim_outbound_messages(p_limit integer default 25,p_tenant_id uuid default null)
returns setof public.outbound_message_queue language sql security definer set search_path=pg_catalog,public as $$
 with exhausted as (
  update public.outbound_message_queue set status='dead_letter',locked_at=null,lease_token=gen_random_uuid(),last_error='delivery_attempt_limit'
  where (p_tenant_id is null or tenant_id=p_tenant_id) and attempts>=max_attempts
   and (status in ('pending','failed') or (status='processing' and locked_at<now()-interval '5 minutes'))
  returning id
 ), due as (
  select d.id from public.outbound_message_queue d
  where (p_tenant_id is null or d.tenant_id=p_tenant_id)
   and ((d.status in ('pending','failed') and d.next_attempt_at<=now() and d.attempts<d.max_attempts)
    or (d.status='processing' and d.locked_at<now()-interval '5 minutes' and d.attempts<d.max_attempts))
  order by d.next_attempt_at,d.id limit greatest(1,least(100,p_limit)) for update skip locked
 )
 update public.outbound_message_queue d set status='processing',attempts=d.attempts+1,
 locked_at=now(),lease_token=gen_random_uuid() from due where d.id=due.id returning d.*;
$$;
revoke all on function public.crm_claim_outbound_messages(integer,uuid) from public,anon,authenticated;
grant execute on function public.crm_claim_outbound_messages(integer,uuid) to service_role;
commit;

