-- Ecojoi CRM - conectores Google/Microsoft + camada final enterprise.
-- Aditivo, idempotente e sem alteração de credenciais existentes.

create table if not exists public.external_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  account_email text,
  display_name text,
  refresh_token_secret_id uuid,
  scopes text[] not null default '{}',
  status text not null default 'active',
  sync_email boolean not null default false,
  sync_calendar boolean not null default false,
  last_mail_sync_at timestamptz,
  last_calendar_sync_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists external_connections_tenant_idx
  on public.external_connections(tenant_id,provider,status);

alter table public.external_connections enable row level security;

drop policy if exists external_connections_select on public.external_connections;
create policy external_connections_select on public.external_connections for select
using(public.has_tenant_access(tenant_id) and public.has_permission('settings.view'));

drop policy if exists external_connections_write on public.external_connections;
create policy external_connections_write on public.external_connections for all
using(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'))
with check(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));

create table if not exists public.external_calendar_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid references public.external_connections(id) on delete cascade,
  provider_event_id text not null,
  calendar_id text,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  organizer_email text,
  attendees jsonb not null default '[]'::jsonb,
  meeting_url text,
  status text not null default 'confirmed',
  metadata jsonb not null default '{}'::jsonb,
  provider_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists external_calendar_period_idx
  on public.external_calendar_events(tenant_id,starts_at,ends_at);

alter table public.external_calendar_events enable row level security;

drop policy if exists external_calendar_select on public.external_calendar_events;
create policy external_calendar_select on public.external_calendar_events for select
using(public.has_tenant_access(tenant_id) and public.has_permission('tasks.view'));

alter table public.contacts
  add column if not exists lead_score_reason jsonb not null default '{}'::jsonb;

alter table public.external_calendar_events
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

create index if not exists external_calendar_contact_idx
  on public.external_calendar_events(tenant_id,contact_id,starts_at)
  where contact_id is not null;

create table if not exists public.external_emails (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid references public.external_connections(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  provider_message_id text not null,
  thread_id text,
  direction text not null check(direction in ('inbound','outbound')),
  subject text,
  snippet text,
  from_address text,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(tenant_id,connection_id,provider_message_id)
);

create index if not exists external_emails_contact_idx
  on public.external_emails(tenant_id,contact_id,sent_at desc)
  where contact_id is not null;

create table if not exists public.interaction_transcripts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  source text not null default 'external',
  external_id text,
  title text,
  transcript text not null,
  summary text,
  next_actions jsonb not null default '[]'::jsonb,
  sentiment text,
  started_at timestamptz,
  duration_seconds integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists transcripts_external_unique_idx
  on public.interaction_transcripts(tenant_id,source,external_id)
  where external_id is not null;

create index if not exists transcripts_contact_idx
  on public.interaction_transcripts(tenant_id,contact_id,created_at desc)
  where contact_id is not null;

create index if not exists transcripts_deal_idx
  on public.interaction_transcripts(tenant_id,deal_id,created_at desc)
  where deal_id is not null;

create table if not exists public.user_dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  widget_key text not null,
  position integer not null default 0,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,user_id,widget_key)
);

create index if not exists dashboard_widgets_user_idx
  on public.user_dashboard_widgets(tenant_id,user_id,position);

alter table public.external_emails enable row level security;
alter table public.interaction_transcripts enable row level security;
alter table public.user_dashboard_widgets enable row level security;

drop policy if exists external_emails_select on public.external_emails;
create policy external_emails_select on public.external_emails for select
using(public.has_tenant_access(tenant_id) and public.has_permission('contacts.view'));

drop policy if exists transcripts_select on public.interaction_transcripts;
create policy transcripts_select on public.interaction_transcripts for select
using(public.has_tenant_access(tenant_id) and (public.has_permission('contacts.view') or public.has_permission('deals.view')));

drop policy if exists dashboard_widgets_select on public.user_dashboard_widgets;
create policy dashboard_widgets_select on public.user_dashboard_widgets for select
using(public.has_tenant_access(tenant_id) and user_id=(select auth.uid()));

drop policy if exists dashboard_widgets_write on public.user_dashboard_widgets;
create policy dashboard_widgets_write on public.user_dashboard_widgets for all
using(public.has_tenant_access(tenant_id) and user_id=(select auth.uid()))
with check(public.has_tenant_access(tenant_id) and user_id=(select auth.uid()));

revoke insert,update,delete on public.external_emails from anon,authenticated;
grant select on public.external_emails to authenticated;
grant select,insert,update,delete on public.external_emails to service_role;

revoke insert,update,delete on public.interaction_transcripts from anon,authenticated;
grant select on public.interaction_transcripts to authenticated;
grant select,insert,update,delete on public.interaction_transcripts to service_role;

create or replace function public.recalculate_contact_score(p_tenant_id uuid,p_contact_id uuid)
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_score integer := 10;
  v_source text;
  v_status public.contact_status;
  v_messages integer := 0;
  v_deals integer := 0;
  v_open_tasks integer := 0;
  v_has_email boolean := false;
  v_has_phone boolean := false;
  v_reason jsonb := '{}'::jsonb;
begin
  select source,status,(email is not null),(phone is not null)
    into v_source,v_status,v_has_email,v_has_phone
  from public.contacts
  where id=p_contact_id and tenant_id=p_tenant_id;

  if not found then return 0; end if;

  select count(*) into v_messages
  from public.messages m
  join public.conversations c on c.id=m.conversation_id and c.tenant_id=m.tenant_id
  where m.tenant_id=p_tenant_id and c.contact_id=p_contact_id;

  select count(*) into v_deals
  from public.deals
  where tenant_id=p_tenant_id and contact_id=p_contact_id;

  select count(*) into v_open_tasks
  from public.tasks
  where tenant_id=p_tenant_id
    and related_contact_id=p_contact_id
    and status not in ('done','completed','closed','cancelled');

  if v_has_phone then v_score:=v_score+12; end if;
  if v_has_email then v_score:=v_score+8; end if;
  if lower(coalesce(v_source,'')) like '%meta%' or lower(coalesce(v_source,'')) like '%google%' then v_score:=v_score+10; end if;
  if v_messages>0 then v_score:=v_score+least(25,v_messages*3); end if;
  if v_deals>0 then v_score:=v_score+least(25,v_deals*15); end if;
  if v_open_tasks>0 then v_score:=v_score+5; end if;
  if v_status='active' then v_score:=greatest(v_score,70); end if;

  v_score:=least(100,greatest(0,v_score));
  v_reason:=jsonb_build_object(
    'phone',v_has_phone,'email',v_has_email,'source',coalesce(v_source,''),
    'messages',v_messages,'deals',v_deals,'open_tasks',v_open_tasks,'recalculated_at',now()
  );

  update public.contacts
  set lead_score=v_score,
      lead_temperature=case when v_score>=70 then 'hot' when v_score>=40 then 'warm' else 'cold' end,
      lead_score_reason=v_reason,
      updated_at=now()
  where id=p_contact_id and tenant_id=p_tenant_id;

  return v_score;
end;
$$;

revoke all on function public.recalculate_contact_score(uuid,uuid) from public,anon,authenticated;
grant execute on function public.recalculate_contact_score(uuid,uuid) to service_role;
