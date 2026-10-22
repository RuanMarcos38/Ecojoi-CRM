-- Ecojoi CRM - merge seguro de contatos duplicados.
create or replace function public.merge_contacts(
  p_tenant_id uuid,
  p_source_id uuid,
  p_target_id uuid
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  s public.contacts%rowtype;
  t public.contacts%rowtype;
begin
  if p_source_id=p_target_id then raise exception 'same_contact'; end if;

  select * into s from public.contacts where id=p_source_id and tenant_id=p_tenant_id for update;
  select * into t from public.contacts where id=p_target_id and tenant_id=p_tenant_id for update;
  if s.id is null or t.id is null then raise exception 'contact_not_found'; end if;

  update public.conversations set contact_id=p_target_id where tenant_id=p_tenant_id and contact_id=p_source_id;
  update public.deals set contact_id=p_target_id where tenant_id=p_tenant_id and contact_id=p_source_id;
  update public.tasks set related_contact_id=p_target_id where tenant_id=p_tenant_id and related_contact_id=p_source_id;
  update public.contact_channels set contact_id=p_target_id,updated_at=now() where tenant_id=p_tenant_id and contact_id=p_source_id;

  insert into public.contact_tags(tenant_id,contact_id,tag_id)
  select tenant_id,p_target_id,tag_id from public.contact_tags where tenant_id=p_tenant_id and contact_id=p_source_id
  on conflict(contact_id,tag_id) do nothing;
  delete from public.contact_tags where tenant_id=p_tenant_id and contact_id=p_source_id;

  update public.notifications set entity_id=p_target_id::text
  where tenant_id=p_tenant_id and entity_type='contact' and entity_id=p_source_id::text;

  update public.contacts
  set
    name=case when length(coalesce(t.name,''))>=length(coalesce(s.name,'')) then t.name else s.name end,
    email=coalesce(t.email,s.email),
    phone=coalesce(t.phone,s.phone),
    source=coalesce(t.source,s.source),
    owner_id=coalesce(t.owner_id,s.owner_id),
    organization_id=coalesce(t.organization_id,s.organization_id),
    attribution=coalesce(s.attribution,'{}'::jsonb) || coalesce(t.attribution,'{}'::jsonb),
    custom_fields=coalesce(s.custom_fields,'{}'::jsonb) || coalesce(t.custom_fields,'{}'::jsonb),
    lead_score=greatest(coalesce(t.lead_score,0),coalesce(s.lead_score,0)),
    lead_temperature=case
      when t.lead_temperature='hot' or s.lead_temperature='hot' then 'hot'
      when t.lead_temperature='warm' or s.lead_temperature='warm' then 'warm'
      else 'cold'
    end,
    consent_status=case
      when t.consent_status='opt_out' or s.consent_status='opt_out' then 'opt_out'
      when t.consent_status='opt_in' or s.consent_status='opt_in' then 'opt_in'
      else 'unknown'
    end,
    consent_at=greatest(t.consent_at,s.consent_at),
    updated_at=now()
  where id=p_target_id and tenant_id=p_tenant_id;

  delete from public.contacts where id=p_source_id and tenant_id=p_tenant_id;
  return p_target_id;
end;
$$;

revoke all on function public.merge_contacts(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.merge_contacts(uuid,uuid,uuid) to service_role;
