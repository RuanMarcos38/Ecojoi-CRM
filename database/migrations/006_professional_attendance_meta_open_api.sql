-- Ecojoi CRM - atendimento profissional, Meta e API pública.
-- Alterações exclusivamente aditivas; preserva estrutura, dados e credenciais existentes.

alter table public.tenant_settings
  add column if not exists auto_assign_leads boolean not null default true;

alter table public.tenant_settings
  add column if not exists meta_business_id text;

alter table public.tenant_settings
  add column if not exists meta_waba_id text;

alter table public.tenant_settings
  add column if not exists meta_phone_number_id text;

alter table public.tenant_settings
  add column if not exists meta_page_id text;

alter table public.tenant_settings
  add column if not exists meta_instagram_account_id text;

alter table public.profiles
  add column if not exists last_lead_assigned_at timestamptz;

alter table public.contacts
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;

create index if not exists contacts_tenant_owner_idx
  on public.contacts(tenant_id, owner_id);

create unique index if not exists messages_tenant_provider_message_uidx
  on public.messages(tenant_id, provider_message_id)
  where provider_message_id is not null;

create table if not exists public.contact_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','instagram','facebook','email','external')),
  external_id text not null,
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, channel, external_id)
);

create index if not exists contact_channels_contact_idx
  on public.contact_channels(tenant_id, contact_id);

alter table public.contact_channels enable row level security;
revoke all on table public.contact_channels from anon, authenticated;
grant select, insert, update, delete on table public.contact_channels to service_role;

create table if not exists public.integration_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  event_key text not null,
  event_type text not null,
  payload_meta jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique(tenant_id, provider, event_key)
);

create index if not exists integration_events_tenant_received_idx
  on public.integration_events(tenant_id, received_at desc);

alter table public.integration_events enable row level security;
revoke all on table public.integration_events from anon, authenticated;
grant select, insert, update, delete on table public.integration_events to service_role;

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists api_keys_tenant_active_idx
  on public.api_keys(tenant_id, active, created_at desc);

alter table public.api_keys enable row level security;
revoke all on table public.api_keys from anon, authenticated;
grant select, insert, update, delete on table public.api_keys to service_role;

create or replace function public.next_lead_assignee(p_tenant_id uuid)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_enabled boolean;
  v_user uuid;
begin
  if p_tenant_id is null then return null; end if;

  select coalesce(ts.auto_assign_leads, true)
    into v_enabled
  from public.tenant_settings ts
  where ts.tenant_id = p_tenant_id;

  if v_enabled is false then return null; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 9173));

  select p.id
    into v_user
  from public.profiles p
  where p.tenant_id = p_tenant_id
    and p.active = true
    and p.role in ('company_admin','manager','user')
  order by p.last_lead_assigned_at nulls first, p.created_at, p.id
  limit 1;

  if v_user is not null then
    update public.profiles
    set last_lead_assigned_at = now(),
        updated_at = now()
    where id = v_user
      and tenant_id = p_tenant_id;
  end if;

  return v_user;
end;
$$;

revoke all on function public.next_lead_assignee(uuid) from public, anon, authenticated;
grant execute on function public.next_lead_assignee(uuid) to service_role;

create or replace function public.validate_contact_owner_tenant()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  if new.owner_id is not null and not exists (
    select 1
    from public.profiles p
    where p.id = new.owner_id
      and p.tenant_id = new.tenant_id
  ) then
    raise exception 'cross-tenant contact owner reference';
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_owner_same_tenant on public.contacts;
create trigger contacts_owner_same_tenant
before insert or update of owner_id, tenant_id on public.contacts
for each row execute function public.validate_contact_owner_tenant();

create or replace function public.validate_contact_channel_tenant()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  if not exists (
    select 1
    from public.contacts c
    where c.id = new.contact_id
      and c.tenant_id = new.tenant_id
  ) then
    raise exception 'cross-tenant contact channel reference';
  end if;
  return new;
end;
$$;

drop trigger if exists contact_channels_same_tenant on public.contact_channels;
create trigger contact_channels_same_tenant
before insert or update on public.contact_channels
for each row execute function public.validate_contact_channel_tenant();

create or replace function public.validate_api_key_creator_tenant()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  if new.created_by is not null and not exists (
    select 1
    from public.profiles p
    where p.id = new.created_by
      and p.tenant_id = new.tenant_id
  ) then
    raise exception 'cross-tenant api key creator reference';
  end if;
  return new;
end;
$$;

drop trigger if exists api_keys_creator_same_tenant on public.api_keys;
create trigger api_keys_creator_same_tenant
before insert or update on public.api_keys
for each row execute function public.validate_api_key_creator_tenant();

comment on column public.contacts.owner_id is
  'Responsável comercial definido automaticamente ou manualmente para o lead.';

comment on table public.contact_channels is
  'Identidades externas do contato por canal, usadas para evitar duplicidade em integrações.';

comment on table public.api_keys is
  'Chaves de integração da API pública. Somente o hash é persistido.';
