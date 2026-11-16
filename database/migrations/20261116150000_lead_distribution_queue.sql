alter table public.profiles add column if not exists receives_automatic_leads boolean not null default true;

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
 where p.tenant_id=p_tenant_id and p.active=true and p.deleted_at is null and p.receives_automatic_leads and p.role in ('company_admin','manager','user')
   and p.availability_state in ('online','busy')
   and (select count(*) from public.conversations c where c.tenant_id=p_tenant_id and c.assigned_to=p.id and c.status<>'closed') < p.max_open_conversations
 order by case p.availability_state when 'online' then 0 else 1 end,
          p.last_lead_assigned_at nulls first,p.created_at,p.id
 limit 1;
 if v_user is not null then update public.profiles set last_lead_assigned_at=now(),updated_at=now() where id=v_user and tenant_id=p_tenant_id; end if;
 return v_user;
end; $function$;

CREATE OR REPLACE FUNCTION public.manage_team_member_access(p_actor uuid, p_target uuid, p_patch jsonb DEFAULT '{}'::jsonb, p_delete boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare actor public.profiles; target public.profiles; result public.profiles; master boolean;
begin
 select * into actor from public.profiles where id=p_actor;
 if not found then return jsonb_build_object('error','forbidden'); end if;
 -- Serialize management actions within a tenant, including simultaneous admin changes.
 perform 1 from public.tenants where id=actor.tenant_id and active=true for update;
 if not found then return jsonb_build_object('error','forbidden'); end if;
 select * into actor from public.profiles where id=p_actor;
 if not actor.active or actor.deleted_at is not null then return jsonb_build_object('error','forbidden'); end if;
 select * into target from public.profiles where id=p_target and tenant_id=actor.tenant_id for update;
 if not found then return jsonb_build_object('error','not_found'); end if;
 master:=actor.role in ('company_admin','super_admin');
 if not master then
  if actor.role<>'manager' or target.role<>'user' or p_delete or p_patch<>'{"active":false}'::jsonb then return jsonb_build_object('error','forbidden'); end if;
 end if;
 if target.role='super_admin' and actor.role<>'super_admin' then return jsonb_build_object('error','forbidden'); end if;
 if p_target=p_actor and (p_delete or p_patch->>'active'='false' or (p_patch ? 'role' and p_patch->>'role'<>actor.role::text)) then return jsonb_build_object('error','cannot_change_self_access'); end if;
 if target.deleted_at is not null and not (master and p_patch='{"restore":true}'::jsonb) then return jsonb_build_object('error','user_deleted'); end if;
 if p_patch ? 'role' and p_patch->>'role' not in ('company_admin','manager','user') then return jsonb_build_object('error','invalid_payload'); end if;
 if p_delete or p_patch->>'active'='false' then
  update public.conversations set assigned_to=null,
    attendance_state=case when attendance_state='automatic' then 'automatic' else 'waiting' end,
    attendance_changed_at=now(),updated_at=now()
  where tenant_id=actor.tenant_id and assigned_to=p_target and status<>'closed';
 end if;
 update public.profiles set
  active=case when p_delete or p_patch->>'restore'='true' then false when p_patch ? 'active' then (p_patch->>'active')::boolean else active end,
  deleted_at=case when p_delete then now() when p_patch->>'restore'='true' then null else deleted_at end,
  role=case when p_patch ? 'role' then (p_patch->>'role')::public.app_role else role end,
  availability_state=case when p_delete or p_patch->>'active'='false' or p_patch->>'restore'='true' then 'offline' when p_patch ? 'availability_state' then p_patch->>'availability_state' else availability_state end,
  receives_automatic_leads=case when p_patch ? 'receives_automatic_leads' then (p_patch->>'receives_automatic_leads')::boolean else receives_automatic_leads end,
  max_open_conversations=case when p_patch ? 'max_open_conversations' then (p_patch->>'max_open_conversations')::integer else max_open_conversations end,
  updated_at=now()
 where id=p_target and tenant_id=actor.tenant_id returning * into result;
 return jsonb_build_object('data',to_jsonb(result));
end $function$;
