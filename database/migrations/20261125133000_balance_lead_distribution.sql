-- Prioritize the smallest active workload; rotate among users with equal workload.

CREATE OR REPLACE FUNCTION public.next_lead_assignee(p_tenant_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_enabled boolean; v_user uuid;
begin
 if p_tenant_id is null then return null; end if;
 select coalesce(ts.auto_assign_leads,true) into v_enabled from public.tenant_settings ts where ts.tenant_id=p_tenant_id;
 if v_enabled is false then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,9173));
 select p.id into v_user
 from public.profiles p
 cross join lateral (
   select count(*) as open_count
   from public.conversations c
   where c.tenant_id=p_tenant_id and c.assigned_to=p.id and c.status<>'closed'
 ) workload
 where p.tenant_id=p_tenant_id and p.active=true and p.deleted_at is null and p.receives_automatic_leads and p.role in ('company_admin','manager','user')
   and p.availability_state = 'online'
   and workload.open_count < p.max_open_conversations
 order by workload.open_count,
          p.last_lead_assigned_at nulls first,p.created_at,p.id
 limit 1;
 if v_user is not null then update public.profiles set last_lead_assigned_at=now(),updated_at=now() where id=v_user and tenant_id=p_tenant_id; end if;
 return v_user;
end; $function$;

revoke all on function public.next_lead_assignee(uuid) from public, anon, authenticated;
grant execute on function public.next_lead_assignee(uuid) to service_role;
