begin;
-- Contact identity resolution and channel binding share a transaction and tenant-scoped lock.
create or replace function public.crm_resolve_lead_identity(
 p_tenant_id uuid,p_channel text,p_external_id text,p_name text,p_fallback_name text,p_email text,p_phone text,p_source text,p_attribution jsonb,p_score integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.contacts%rowtype;v_id uuid;v_matches uuid[];v_owner uuid;v_new boolean:=false;v_score integer;v_temperature text;
begin
 if p_tenant_id is null or p_channel not in ('internal','whatsapp','instagram','facebook','email','external') then raise exception 'invalid_lead_identity';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-lead:'||p_tenant_id::text,9174));
 if p_external_id is not null and p_channel<>'internal' then
  select contact_id into v_id from public.contact_channels where tenant_id=p_tenant_id and channel=p_channel and external_id=p_external_id;
 end if;
 if v_id is null and p_phone is not null then
  select array_agg(id) into v_matches from public.crm_find_phone_contacts(p_tenant_id,p_phone);
  if cardinality(v_matches)>1 then raise exception 'lead_identity_manual_review';end if;
  v_id:=v_matches[1];
 end if;
 if v_id is null and p_email is not null then
  select array_agg(id) into v_matches from(select id from public.contacts where tenant_id=p_tenant_id and lower(email)=lower(p_email) limit 2) matches;
  if cardinality(v_matches)>1 then raise exception 'lead_identity_manual_review';end if;
  v_id:=v_matches[1];
 end if;
 v_score:=greatest(0,least(100,p_score));
 if v_id is not null then
  select * into c from public.contacts where tenant_id=p_tenant_id and id=v_id for update;
  if not found then raise exception 'lead_identity_contact_missing';end if;
  v_owner:=coalesce(c.owner_id,public.next_lead_assignee(p_tenant_id));
  v_score:=greatest(coalesce(c.lead_score,0),v_score);
  v_temperature:=case when v_score>=70 then 'hot' when v_score>=40 then 'warm' else 'cold' end;
  update public.contacts set name=coalesce(p_name,c.name),email=coalesce(p_email,c.email),phone=coalesce(p_phone,c.phone),
   source=coalesce(nullif(c.source,''),p_source),attribution=coalesce(c.attribution,'{}')||coalesce(p_attribution,'{}'),
   owner_id=v_owner,lead_score=v_score,lead_temperature=v_temperature,updated_at=now() where id=c.id and tenant_id=p_tenant_id;
 else
  v_new:=true;v_owner:=public.next_lead_assignee(p_tenant_id);
  v_temperature:=case when v_score>=70 then 'hot' when v_score>=40 then 'warm' else 'cold' end;
  insert into public.contacts(tenant_id,name,email,phone,source,status,attribution,owner_id,lead_score,lead_temperature)
   values(p_tenant_id,coalesce(p_name,p_fallback_name,'Novo contato'),p_email,p_phone,p_source,'lead',coalesce(p_attribution,'{}'),v_owner,v_score,v_temperature)
   returning id into v_id;
 end if;
 if p_external_id is not null and p_channel<>'internal' then
  insert into public.contact_channels(tenant_id,contact_id,channel,external_id,display_name,metadata)
   values(p_tenant_id,v_id,p_channel,p_external_id,coalesce(p_name,p_fallback_name),jsonb_build_object('source',p_source))
  on conflict(tenant_id,channel,external_id) do update set display_name=coalesce(p_name,contact_channels.display_name),updated_at=now();
 end if;
 return jsonb_build_object('contact_id',v_id,'owner_id',v_owner,'is_new',v_new);
end;
$$;
revoke all on function public.crm_resolve_lead_identity(uuid,text,text,text,text,text,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.crm_resolve_lead_identity(uuid,text,text,text,text,text,text,text,jsonb,integer) to service_role;
create or replace function public.crm_get_or_create_inbound_conversation(p_tenant_id uuid,p_contact_id uuid,p_channel text,p_owner_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.conversations%rowtype;
begin
 if not exists(select 1 from public.contacts where id=p_contact_id and tenant_id=p_tenant_id) then raise exception 'contact_not_found';end if;
 if p_channel not in ('internal','whatsapp','instagram','facebook','email') then raise exception 'invalid_channel';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-conversation:'||p_tenant_id::text||':'||p_contact_id::text||':'||p_channel,9175));
 select * into c from public.conversations where tenant_id=p_tenant_id and contact_id=p_contact_id and channel=p_channel
  and status<>'closed' order by updated_at desc,id limit 1 for update;
 if found then
  if c.assigned_to is null and c.attendance_state='waiting' and p_owner_id is not null then
   update public.conversations set assigned_to=p_owner_id,attendance_state='in_service',attendance_changed_at=now(),updated_at=now() where id=c.id;
  end if;return c.id;
 end if;
 insert into public.conversations(tenant_id,contact_id,channel,status,assigned_to,attendance_state,attendance_changed_at)
  values(p_tenant_id,p_contact_id,p_channel,'open',p_owner_id,case when p_owner_id is null then 'waiting' else 'in_service' end,now()) returning id into c.id;
 return c.id;
end;
$$;
revoke all on function public.crm_get_or_create_inbound_conversation(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.crm_get_or_create_inbound_conversation(uuid,uuid,text,uuid) to service_role;
commit;

