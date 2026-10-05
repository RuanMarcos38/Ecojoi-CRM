-- Reuses messages, outbound_message_queue, integration_events and ai_usage_logs.
-- No credentials or existing message bodies changed.
begin;
-- Older governance migration created this table before 021, so CREATE IF NOT EXISTS did not add these fields.
alter table public.ai_usage_logs add column if not exists total_tokens integer not null default 0,
 add column if not exists request_id text;
alter table public.messages add column if not exists origin_actor text;
create index if not exists messages_ai_recent_idx on public.messages(tenant_id,conversation_id,created_at desc)
 where origin_actor='ai';
create or replace function public.crm_register_ai_decision(
 p_tenant_id uuid,p_conversation_id uuid,p_event_key text,p_action text,p_body text,
 p_reason text default null,p_summary text default null,p_next_action text default null,p_usage jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 c public.conversations%rowtype; m public.messages%rowtype;
 v_previous jsonb; v_queue uuid; v_phone text; v_response jsonb; v_action text:=p_action; v_reason text:=p_reason;
begin
 if p_action not in ('respond','clarify','escalate') or length(p_event_key)>200 or length(p_event_key)<1 then raise exception 'invalid_ai_decision'; end if;
 select * into c from public.conversations where id=p_conversation_id and tenant_id=p_tenant_id for update;
 if not found then raise exception 'ai_conversation_not_found'; end if;
 select payload_meta->'response' into v_previous from public.integration_events
 where tenant_id=p_tenant_id and provider='ai' and event_key=p_event_key;
 if v_previous is not null then return v_previous||jsonb_build_object('duplicate',true); end if;
 if c.status='closed' or c.attendance_state<>'automatic' then raise exception 'ai_conversation_not_automatic'; end if;
 if p_action in ('respond','clarify') and (p_body is null or length(trim(p_body))<1 or length(p_body)>4000) then raise exception 'invalid_ai_body'; end if;
 if (select count(*) from public.messages where tenant_id=p_tenant_id and conversation_id=p_conversation_id
      and origin_actor='ai' and created_at>=coalesce(c.last_inbound_at,c.created_at))>=3 then
   v_action:='escalate';v_reason:='automatic_reply_limit';
 end if;
 if v_action='escalate' then
  update public.conversations set attendance_state='waiting',assigned_to=null,attendance_changed_at=now(),
   updated_at=now(),ai_summary=coalesce(p_summary,ai_summary),ai_next_action=coalesce(v_reason,'agent_requested_handoff'),ai_summary_updated_at=now()
   where id=c.id and tenant_id=p_tenant_id;
  insert into public.notifications(tenant_id,type,title,body,entity_type,entity_id,priority)
   values(p_tenant_id,'ai_escalated','Atendimento encaminhado à equipe',coalesce(v_reason,'agent_requested_handoff'),'conversation',c.id::text,'high');
  v_response:=jsonb_build_object('action','escalate','delivery','waiting','conversation_id',c.id);
 else
  if c.channel not in ('internal','whatsapp') then raise exception 'ai_unsupported_channel'; end if;
  select phone into v_phone from public.contacts where id=c.contact_id and tenant_id=p_tenant_id;
  insert into public.messages(tenant_id,conversation_id,direction,body,status,message_type,origin_actor)
   values(p_tenant_id,c.id,'outbound',p_body,case when c.channel='internal' then 'sent' else 'queued' end,'text','ai') returning * into m;
  if c.channel='whatsapp' then
   insert into public.outbound_message_queue(tenant_id,conversation_id,message_id,channel,payload,status)
    values(p_tenant_id,c.id,m.id,'whatsapp',jsonb_build_object('kind','text','to',coalesce(v_phone,''),'body',p_body,'actor','ai'),'pending')
    returning id into v_queue;
  end if;
  update public.conversations set updated_at=now(),ai_summary=coalesce(p_summary,ai_summary),
   ai_next_action=coalesce(p_next_action,ai_next_action),ai_summary_updated_at=now(),
   last_outbound_at=case when c.channel='internal' then now() else last_outbound_at end,
   first_response_at=case when c.channel='internal' then coalesce(first_response_at,now()) else first_response_at end
   where id=c.id and tenant_id=p_tenant_id;
  v_response:=jsonb_build_object('action',v_action,'data',to_jsonb(m),'delivery',m.status,'queue_id',v_queue);
 end if;
 insert into public.ai_usage_logs(tenant_id,conversation_id,provider,model,input_tokens,output_tokens,total_tokens,estimated_cost,request_id,metadata)
 values(p_tenant_id,c.id,coalesce(p_usage->>'provider','external'),p_usage->>'model',
  coalesce((p_usage->>'input_tokens')::integer,0),coalesce((p_usage->>'output_tokens')::integer,0),
  coalesce((p_usage->>'input_tokens')::integer,0)+coalesce((p_usage->>'output_tokens')::integer,0),
  coalesce((p_usage->>'estimated_cost')::numeric,0),p_event_key,
  jsonb_build_object('action',v_action,'reason',v_reason,'status','success','schema_version','1.0'));
 insert into public.audit_logs(tenant_id,action,entity,entity_id,metadata)
 values(p_tenant_id,case when v_action='escalate' then 'ai.escalated' else 'ai.reply' end,'conversation',c.id::text,
  jsonb_build_object('request_id',p_event_key,'action',v_action,'reason',v_reason));
 insert into public.integration_events(tenant_id,provider,event_key,event_type,payload_meta)
 values(p_tenant_id,'ai',p_event_key,'ai.decision',jsonb_build_object('response',v_response));
 return v_response;
end;
$$;
revoke all on function public.crm_register_ai_decision(uuid,uuid,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_register_ai_decision(uuid,uuid,text,text,text,text,text,text,jsonb) to service_role;

create or replace function public.crm_cancel_queued_ai()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.attendance_state<>'automatic' or new.status='closed' then
  update public.outbound_message_queue set status='dead_letter',last_error='ai_human_takeover',locked_at=null,updated_at=now()
   where tenant_id=new.tenant_id and conversation_id=new.id and payload->>'actor'='ai' and status in ('pending','failed');
  update public.messages set status='failed' where tenant_id=new.tenant_id and conversation_id=new.id and origin_actor='ai' and status='queued';
 end if;
 return new;
end;
$$;
drop trigger if exists conversations_cancel_queued_ai on public.conversations;
create trigger conversations_cancel_queued_ai after update of attendance_state,status on public.conversations
 for each row execute function public.crm_cancel_queued_ai();
commit;

