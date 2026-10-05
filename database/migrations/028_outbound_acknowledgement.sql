-- A timed-out provider call has an unknown delivery outcome. Manual reconciliation avoids duplicate sends.
begin;
create or replace function public.crm_claim_outbound_messages(p_limit integer default 25,p_tenant_id uuid default null)
returns setof public.outbound_message_queue language sql security definer set search_path=pg_catalog,public as $$
 with exhausted as (
  update public.outbound_message_queue set status='dead_letter',locked_at=null,lease_token=gen_random_uuid(),
   last_error=case when status='processing' then 'delivery_outcome_unknown_reconciliation_required' else 'delivery_attempt_limit' end
  where (p_tenant_id is null or tenant_id=p_tenant_id)
   and ((attempts>=max_attempts and status in ('pending','failed')) or(status='processing' and locked_at<now()-interval '5 minutes')) returning id
 ),due as (
  select id from public.outbound_message_queue where (p_tenant_id is null or tenant_id=p_tenant_id)
   and status in ('pending','failed') and next_attempt_at<=now() and attempts<max_attempts
  order by next_attempt_at,id limit greatest(1,least(100,p_limit)) for update skip locked
 )
 update public.outbound_message_queue d set status='processing',attempts=d.attempts+1,locked_at=now(),lease_token=gen_random_uuid()
 from due where d.id=due.id returning d.*;
$$;
revoke all on function public.crm_claim_outbound_messages(integer,uuid) from public,anon,authenticated;
grant execute on function public.crm_claim_outbound_messages(integer,uuid) to service_role;
create or replace function public.crm_complete_outbound_message(p_tenant_id uuid,p_job_id uuid,p_lease_token uuid,p_provider_message_id text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.outbound_message_queue%rowtype;
begin
 select * into q from public.outbound_message_queue where id=p_job_id and tenant_id=p_tenant_id
  and lease_token=p_lease_token and status='processing' for update;
 if not found then return false;end if;
 update public.outbound_message_queue set status='sent',completed_at=now(),updated_at=now(),last_error=null,locked_at=null where id=q.id;
 if q.message_id is not null then
  update public.messages set status='sent',provider_message_id=p_provider_message_id where id=q.message_id and tenant_id=p_tenant_id;
 end if;
 update public.conversations set last_outbound_at=now(),first_response_at=coalesce(first_response_at,now()),updated_at=now()
 where id=q.conversation_id and tenant_id=p_tenant_id;
 return true;
end;
$$;
revoke all on function public.crm_complete_outbound_message(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.crm_complete_outbound_message(uuid,uuid,uuid,text) to service_role;
commit;

