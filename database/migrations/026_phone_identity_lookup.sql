-- Read-only identity lookup; preserves legacy phones and allows shared numbers.
begin;
create or replace function public.crm_phone_lookup_key(p_phone text) returns text
language sql immutable strict set search_path=pg_catalog,public as $$
 select case
  when trim(p_phone) !~ '^[+]?[0-9 ().-]+$' then null
  when left(trim(p_phone),1)='+' then regexp_replace(p_phone,'[^0-9]','','g')
  when regexp_replace(p_phone,'[^0-9]','','g') ~ '^55[0-9]{10,11}$' then regexp_replace(p_phone,'[^0-9]','','g')
  when length(regexp_replace(p_phone,'[^0-9]','','g')) in (10,11) then '55'||regexp_replace(p_phone,'[^0-9]','','g')
  else null end;
$$;
create index if not exists contacts_phone_lookup_idx on public.contacts(tenant_id,public.crm_phone_lookup_key(phone));
create or replace function public.crm_find_phone_contacts(p_tenant_id uuid,p_phone text)
returns table(id uuid,phone text) language sql stable security definer set search_path=pg_catalog,public as $$
 select c.id,c.phone from public.contacts c where c.tenant_id=p_tenant_id
  and public.crm_phone_lookup_key(c.phone)=public.crm_phone_lookup_key(p_phone) order by c.id limit 3;
$$;
revoke all on function public.crm_find_phone_contacts(uuid,text) from public,anon,authenticated;
grant execute on function public.crm_find_phone_contacts(uuid,text) to service_role;
commit;

