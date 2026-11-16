create table public.whatsapp_reactivation_campaigns (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  template_id uuid not null,
  phones text[] not null check (cardinality(phones) between 1 and 500),
  cursor_pos integer not null default 0,
  accepted integer not null default 0,
  skipped integer not null default 0,
  status text not null default 'queued' check (status in ('queued','paused','cancelled','completed')),
  processing boolean not null default false,
  next_at timestamptz not null default now(),
  last_result text,
  created_at timestamptz not null default now()
);
create unique index whatsapp_single_reactivation_idx on public.whatsapp_reactivation_campaigns(tenant_id)
  where status in ('queued','paused') or processing;
create table public.whatsapp_reactivation_suppressions (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, phone)
);
create table public.whatsapp_reactivation_deliveries (
  campaign_id uuid not null references public.whatsapp_reactivation_campaigns(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_message_id text not null,
  primary key (tenant_id, provider_message_id)
);
alter table public.whatsapp_reactivation_campaigns enable row level security;
alter table public.whatsapp_reactivation_suppressions enable row level security;
alter table public.whatsapp_reactivation_deliveries enable row level security;
revoke all on public.whatsapp_reactivation_campaigns, public.whatsapp_reactivation_suppressions, public.whatsapp_reactivation_deliveries from anon, authenticated;
grant select, insert, update on public.whatsapp_reactivation_campaigns to service_role;
grant select, insert on public.whatsapp_reactivation_suppressions, public.whatsapp_reactivation_deliveries to service_role;

create function public.reactivation_audience(p_tenant uuid, p_phones text[])
returns table(phone text) language sql stable security invoker set search_path = '' as $$
 with candidates as (
   select c.status, c.consent_status, c.consent_at,
     case when left(btrim(c.phone),1) <> '+' and length(n.digits) in (10,11)
          then '55' || n.digits else n.digits end as normalized
   from public.contacts c cross join lateral
     (select regexp_replace(c.phone, '[^0-9]', '', 'g') as digits) n
   where c.tenant_id = p_tenant and c.phone is not null
 )
 select c.normalized from candidates c
 where c.normalized = any(p_phones)
   and not exists(select 1 from public.whatsapp_reactivation_suppressions s
                  where s.tenant_id=p_tenant and s.phone=c.normalized)
 group by c.normalized
 having bool_or(c.consent_status = 'opt_in' and c.consent_at is not null and c.status <> 'inactive')
    and not bool_or(c.consent_status = 'opt_out');
$$;
revoke execute on function public.reactivation_audience(uuid,text[]) from public, anon, authenticated;
grant execute on function public.reactivation_audience(uuid,text[]) to service_role;
