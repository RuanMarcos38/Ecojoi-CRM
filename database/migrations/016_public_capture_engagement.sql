-- Ecojoi CRM - Public Capture & Engagement Suite
-- Aditivo e multiempresa. Nenhuma credencial existente é alterada.

create table if not exists public.capture_forms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slug text not null,
  name text not null,
  title text not null,
  description text,
  fields jsonb not null default '[
    {"name":"name","label":"Nome","type":"text","required":true},
    {"name":"email","label":"E-mail","type":"email","required":false},
    {"name":"phone","label":"Telefone","type":"tel","required":false}
  ]'::jsonb,
  source text not null default 'Formulário',
  success_message text not null default 'Recebemos seus dados com sucesso.',
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,slug)
);

create table if not exists public.capture_form_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  form_id uuid not null references public.capture_forms(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  ip_hash text,
  user_agent text,
  submitted_at timestamptz not null default now()
);
create index if not exists capture_submissions_tenant_idx
  on public.capture_form_submissions(tenant_id,form_id,submitted_at desc);

create table if not exists public.booking_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  slug text not null,
  name text not null,
  duration_minutes integer not null default 30 check(duration_minutes between 10 and 480),
  timezone text not null default 'America/Sao_Paulo',
  working_hours jsonb not null default '{"mon":[["09:00","17:00"]],"tue":[["09:00","17:00"]],"wed":[["09:00","17:00"]],"thu":[["09:00","17:00"]],"fri":[["09:00","17:00"]]}'::jsonb,
  buffer_minutes integer not null default 0 check(buffer_minutes between 0 and 240),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,slug)
);

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_link_id uuid not null references public.booking_links(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  name text not null,
  email text,
  phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text,
  status text not null default 'confirmed' check(status in ('confirmed','cancelled','completed','no_show')),
  created_at timestamptz not null default now(),
  unique(booking_link_id,starts_at)
);
create index if not exists booking_requests_tenant_starts_idx
  on public.booking_requests(tenant_id,starts_at);

create table if not exists public.webchat_widgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  public_key uuid not null default gen_random_uuid() unique,
  name text not null,
  welcome_message text not null default 'Olá! Como podemos ajudar?',
  active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webchat_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  widget_id uuid not null references public.webchat_widgets(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  session_token uuid not null default gen_random_uuid() unique,
  visitor_name text,
  visitor_email text,
  visitor_phone text,
  status text not null default 'open' check(status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webchat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null references public.webchat_sessions(id) on delete cascade,
  direction text not null check(direction in ('visitor','agent','system')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists webchat_messages_session_idx
  on public.webchat_messages(tenant_id,session_id,created_at);

create table if not exists public.customer_survey_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  survey_id uuid not null references public.customer_surveys(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  token uuid not null default gen_random_uuid() unique,
  expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists survey_invitations_tenant_idx
  on public.customer_survey_invitations(tenant_id,survey_id,created_at desc);

alter table public.capture_forms enable row level security;
alter table public.capture_form_submissions enable row level security;
alter table public.booking_links enable row level security;
alter table public.booking_requests enable row level security;
alter table public.webchat_widgets enable row level security;
alter table public.webchat_sessions enable row level security;
alter table public.webchat_messages enable row level security;
alter table public.customer_survey_invitations enable row level security;

drop policy if exists capture_forms_select on public.capture_forms;
create policy capture_forms_select on public.capture_forms for select
using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.view'));
drop policy if exists capture_forms_write on public.capture_forms;
create policy capture_forms_write on public.capture_forms for all
using (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));

drop policy if exists capture_submissions_select on public.capture_form_submissions;
create policy capture_submissions_select on public.capture_form_submissions for select
using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.view'));

drop policy if exists booking_links_select on public.booking_links;
create policy booking_links_select on public.booking_links for select
using (public.has_tenant_access(tenant_id) and public.has_permission('tasks.view'));
drop policy if exists booking_links_write on public.booking_links;
create policy booking_links_write on public.booking_links for all
using (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));

drop policy if exists booking_requests_select on public.booking_requests;
create policy booking_requests_select on public.booking_requests for select
using (public.has_tenant_access(tenant_id) and public.has_permission('tasks.view'));
drop policy if exists booking_requests_write on public.booking_requests;
create policy booking_requests_write on public.booking_requests for all
using (public.has_tenant_access(tenant_id) and public.has_permission('tasks.update'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('tasks.update'));

drop policy if exists webchat_widgets_select on public.webchat_widgets;
create policy webchat_widgets_select on public.webchat_widgets for select
using (public.has_tenant_access(tenant_id) and public.has_permission('settings.view'));
drop policy if exists webchat_widgets_write on public.webchat_widgets;
create policy webchat_widgets_write on public.webchat_widgets for all
using (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));

drop policy if exists webchat_sessions_select on public.webchat_sessions;
create policy webchat_sessions_select on public.webchat_sessions for select
using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.view'));
drop policy if exists webchat_messages_select on public.webchat_messages;
create policy webchat_messages_select on public.webchat_messages for select
using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.view'));

drop policy if exists survey_invites_select on public.customer_survey_invitations;
create policy survey_invites_select on public.customer_survey_invitations for select
using (public.has_tenant_access(tenant_id) and public.has_permission('reports.view'));
drop policy if exists survey_invites_write on public.customer_survey_invitations;
create policy survey_invites_write on public.customer_survey_invitations for all
using (public.has_tenant_access(tenant_id) and public.has_permission('reports.view'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('reports.view'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='webchat_messages'
  ) then
    alter publication supabase_realtime add table public.webchat_messages;
  end if;
end $$;
