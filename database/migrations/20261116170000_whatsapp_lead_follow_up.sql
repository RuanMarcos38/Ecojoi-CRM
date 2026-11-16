create table public.whatsapp_lead_follow_up_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_lead_follow_up_settings enable row level security;
revoke all on public.whatsapp_lead_follow_up_settings from anon, authenticated;
grant select, insert, update on public.whatsapp_lead_follow_up_settings to service_role;

alter table public.whatsapp_reactivation_campaigns add column follow_up_contact_id uuid references public.contacts(id) on delete cascade;
create unique index whatsapp_lead_follow_up_once_idx
  on public.whatsapp_reactivation_campaigns(tenant_id, follow_up_contact_id)
  where follow_up_contact_id is not null;

create function public.whatsapp_lead_follow_up_candidate(p_tenant uuid, p_contact uuid default null)
returns table(contact_id uuid, phone text) language sql stable security invoker set search_path = '' as $$
  select c.id, audience.phone
  from public.contacts c
  cross join lateral (
    select max(greatest(v.last_inbound_at,v.last_outbound_at)) as last_contact,
      bool_or(v.channel='whatsapp' and v.status<>'closed' and v.attendance_state='in_service'
        and v.last_inbound_at is not null) as open_whatsapp
    from public.conversations v where v.tenant_id=c.tenant_id and v.contact_id=c.id
  ) activity
  cross join lateral (select regexp_replace(c.phone,'[^0-9]','','g') digits) normalized
  cross join lateral public.reactivation_audience(p_tenant,array[
    case when left(btrim(c.phone),1)<>'+' and length(normalized.digits) in (10,11)
      then '55'||normalized.digits else normalized.digits end]) audience
  where c.tenant_id=p_tenant and c.status='lead' and c.consent_status='opt_in' and c.consent_at is not null
    and activity.open_whatsapp and activity.last_contact < now()-interval '5 days'
    and (p_contact is null or c.id=p_contact)
    and (p_contact is not null or not exists (
      select 1 from public.whatsapp_reactivation_campaigns job
      where job.tenant_id=p_tenant and job.follow_up_contact_id=c.id
    ))
  order by activity.last_contact, c.id
  limit 1;
$$;
revoke execute on function public.whatsapp_lead_follow_up_candidate(uuid,uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_lead_follow_up_candidate(uuid,uuid) to service_role;
