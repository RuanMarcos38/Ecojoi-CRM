begin;
-- Existing active knowledge stays published; new submissions explicitly start as drafts.
alter table public.ai_knowledge_documents add column if not exists published_version integer not null default 1,
 add column if not exists draft_name text, add column if not exists draft_text text,
 add column if not exists published_at timestamptz, add column if not exists version_history jsonb not null default '[]'::jsonb;
create or replace function public.crm_update_knowledge(p_tenant_id uuid,p_document_id uuid,p_user_id uuid,
 p_action text,p_expected_updated_at timestamptz,p_name text default null,p_text text default null,p_restore_version integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.ai_knowledge_documents%rowtype;v_history jsonb;v_restore jsonb;
begin
 select * into d from public.ai_knowledge_documents where id=p_document_id and tenant_id=p_tenant_id for update;
 if not found then raise exception 'knowledge_not_found';end if;
 if d.updated_at is distinct from p_expected_updated_at then raise exception 'knowledge_changed_reload';end if;
 if p_action='draft' then
  if length(trim(p_name))<2 or length(p_name)>180 or length(trim(p_text))<1 or length(p_text)>120000 then raise exception 'invalid_knowledge';end if;
  update public.ai_knowledge_documents set draft_name=p_name,draft_text=p_text,updated_at=clock_timestamp() where id=d.id;
 elsif p_action='publish' then
  if d.draft_text is null then raise exception 'knowledge_no_draft';end if;
  v_history:=d.version_history;
  if d.published_version>0 then
   v_history:=jsonb_build_array(jsonb_build_object('version',d.published_version,'name',d.name,'text',d.extracted_text,'published_at',d.published_at))||v_history;
  end if;
  select coalesce(jsonb_agg(item),'[]') into v_history from(select item from jsonb_array_elements(v_history) with ordinality e(item,n) order by n limit 20) h;
  update public.ai_knowledge_documents set name=coalesce(d.draft_name,d.name),extracted_text=d.draft_text,
   published_version=d.published_version+1,published_at=clock_timestamp(),version_history=v_history,
   draft_name=null,draft_text=null,active=true,updated_at=clock_timestamp() where id=d.id;
 elsif p_action='archive' then
  update public.ai_knowledge_documents set active=false,updated_at=clock_timestamp() where id=d.id;
 elsif p_action='restore' then
  select item into v_restore from jsonb_array_elements(d.version_history) item where (item->>'version')::integer=p_restore_version limit 1;
  if v_restore is null then raise exception 'knowledge_version_not_found';end if;
  update public.ai_knowledge_documents set draft_name=v_restore->>'name',draft_text=v_restore->>'text',updated_at=clock_timestamp() where id=d.id;
 else raise exception 'invalid_knowledge_action';end if;
 insert into public.audit_logs(tenant_id,user_id,action,entity,entity_id,metadata)
 values(p_tenant_id,p_user_id,'knowledge.'||p_action,'ai_knowledge_document',d.id::text,jsonb_build_object('previous_version',d.published_version));
 select * into d from public.ai_knowledge_documents where id=d.id;
 return jsonb_build_object('id',d.id,'name',d.name,'active',d.active,'published_version',d.published_version,'has_draft',d.draft_text is not null,'updated_at',d.updated_at);
end;
$$;
revoke all on function public.crm_update_knowledge(uuid,uuid,uuid,text,timestamptz,text,text,integer) from public,anon,authenticated;
grant execute on function public.crm_update_knowledge(uuid,uuid,uuid,text,timestamptz,text,text,integer) to service_role;
commit;

