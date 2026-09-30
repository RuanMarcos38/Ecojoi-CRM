-- Ecojoi CRM - agenda pública, sequências e playbooks.
-- Aditivo e isolado por tenant.

create table if not exists public.booking_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  slug text not null unique,
  duration_minutes integer not null default 30 check(duration_minutes between 5 and 480),
  timezone text not null default 'America/Sao_Paulo',
  available_weekdays integer[] not null default '{1,2,3,4,5}',
  day_start time not null default '09:00',
  day_end time not null default '18:00',
  interval_minutes integer not null default 30 check(interval_minutes between 5 and 240),
  buffer_minutes integer not null default 0 check(buffer_minutes between 0 and 240),
  active boolean not null default true,
  calendar_webhook_url text,
  confirmation_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_pages_tenant_idx on public.booking_pages(tenant_id,active);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_page_id uuid not null references public.booking_pages(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  guest_name text not null,
  guest_email text,
  guest_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check(status in ('confirmed','cancelled','completed','no_show')),
  notes text,
  external_event_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists bookings_owner_slot_uidx on public.bookings(tenant_id,owner_id,starts_at)
  where status='confirmed';
create index if not exists bookings_tenant_start_idx on public.bookings(tenant_id,starts_at);

create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  position integer not null,
  delay_minutes integer not null default 0 check(delay_minutes >= 0),
  action_type text not null check(action_type in ('whatsapp','email','task','internal_message')),
  subject text,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(sequence_id,position)
);

create table if not exists public.sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  current_position integer not null default 0,
  status text not null default 'active' check(status in ('active','paused','completed','cancelled')),
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sequence_id,contact_id)
);

create index if not exists sequence_enrollments_due_idx on public.sequence_enrollments(tenant_id,status,next_run_at)
  where status='active';

create table if not exists public.playbooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  entity_type text not null default 'contact' check(entity_type in ('contact','deal')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playbook_questions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  label text not null,
  field_key text not null,
  response_type text not null default 'text' check(response_type in ('text','number','select','boolean')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(playbook_id,field_key)
);

create table if not exists public.playbook_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now()
);

create index if not exists playbook_responses_entity_idx on public.playbook_responses(tenant_id,contact_id,deal_id,completed_at desc);

alter table public.booking_pages enable row level security;
alter table public.bookings enable row level security;
alter table public.sequences enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.sequence_enrollments enable row level security;
alter table public.playbooks enable row level security;
alter table public.playbook_questions enable row level security;
alter table public.playbook_responses enable row level security;

drop policy if exists booking_pages_select on public.booking_pages;
create policy booking_pages_select on public.booking_pages for select using(public.has_tenant_access(tenant_id) and public.has_permission('tasks.view'));
drop policy if exists booking_pages_write on public.booking_pages;
create policy booking_pages_write on public.booking_pages for all using(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage')) with check(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));

drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings for select using(public.has_tenant_access(tenant_id) and public.has_permission('tasks.view'));
drop policy if exists bookings_write on public.bookings;
create policy bookings_write on public.bookings for all using(public.has_tenant_access(tenant_id) and public.has_permission('tasks.update')) with check(public.has_tenant_access(tenant_id) and public.has_permission('tasks.update'));

drop policy if exists sequences_select on public.sequences;
create policy sequences_select on public.sequences for select using(public.has_tenant_access(tenant_id) and public.has_permission('automations.view'));
drop policy if exists sequences_write on public.sequences;
create policy sequences_write on public.sequences for all using(public.has_tenant_access(tenant_id) and public.has_permission('automations.manage')) with check(public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));

drop policy if exists sequence_steps_select on public.sequence_steps;
create policy sequence_steps_select on public.sequence_steps for select using(public.has_tenant_access(tenant_id) and public.has_permission('automations.view'));
drop policy if exists sequence_steps_write on public.sequence_steps;
create policy sequence_steps_write on public.sequence_steps for all using(public.has_tenant_access(tenant_id) and public.has_permission('automations.manage')) with check(public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));

drop policy if exists sequence_enrollments_select on public.sequence_enrollments;
create policy sequence_enrollments_select on public.sequence_enrollments for select using(public.has_tenant_access(tenant_id) and public.has_permission('automations.view'));
drop policy if exists sequence_enrollments_write on public.sequence_enrollments;
create policy sequence_enrollments_write on public.sequence_enrollments for all using(public.has_tenant_access(tenant_id) and public.has_permission('automations.manage')) with check(public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));

drop policy if exists playbooks_select on public.playbooks;
create policy playbooks_select on public.playbooks for select using(public.has_tenant_access(tenant_id) and public.has_permission('contacts.view'));
drop policy if exists playbooks_write on public.playbooks;
create policy playbooks_write on public.playbooks for all using(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage')) with check(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));

drop policy if exists playbook_questions_select on public.playbook_questions;
create policy playbook_questions_select on public.playbook_questions for select using(public.has_tenant_access(tenant_id) and public.has_permission('contacts.view'));
drop policy if exists playbook_questions_write on public.playbook_questions;
create policy playbook_questions_write on public.playbook_questions for all using(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage')) with check(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));

drop policy if exists playbook_responses_select on public.playbook_responses;
create policy playbook_responses_select on public.playbook_responses for select using(public.has_tenant_access(tenant_id) and public.has_permission('contacts.view'));
drop policy if exists playbook_responses_write on public.playbook_responses;
create policy playbook_responses_write on public.playbook_responses for all using(public.has_tenant_access(tenant_id) and public.has_permission('contacts.update')) with check(public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'));
