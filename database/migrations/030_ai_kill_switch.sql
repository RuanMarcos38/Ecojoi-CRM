begin;
create or replace function public.crm_ai_kill_switch()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.ai_agent_config->>'enabled'='false' then
  with handed_off as (
   update public.conversations set attendance_state='waiting',assigned_to=null,attendance_changed_at=now(),updated_at=now(),
    ai_next_action='ai_disabled_for_tenant'
   where tenant_id=new.tenant_id and attendance_state='automatic' and status<>'closed' returning id
  )
  insert into public.notifications(tenant_id,type,title,body,entity_type,entity_id,priority)
   select new.tenant_id,'ai_escalated','Atendimento encaminhado à equipe','Agente desativado nas configurações.','conversation',id::text,'high' from handed_off;
 end if;
 return new;
end;
$$;
revoke all on function public.crm_ai_kill_switch() from public,anon,authenticated;
revoke all on function public.crm_cancel_queued_ai() from public,anon,authenticated;
drop trigger if exists tenant_settings_ai_kill_switch on public.tenant_settings;
create trigger tenant_settings_ai_kill_switch after insert or update of ai_agent_config on public.tenant_settings
 for each row execute function public.crm_ai_kill_switch();
commit;

