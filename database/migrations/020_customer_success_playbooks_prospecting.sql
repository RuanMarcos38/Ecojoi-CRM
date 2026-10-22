-- Ecojoi CRM - relacionamento, playbooks e prospecção.
-- Compatível com a estrutura de pós-venda já existente.
-- Aditivo e multiempresa. Não remove dados nem credenciais.

create table if not exists public.customer_success_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  status text not null default 'onboarding'
    check(status in ('onboarding','in_progress','waiting_customer','completed','cancelled')),
  title text not null,
  notes text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_success_cases
  add column if not exists case_type text not null default 'post_sale'
    check(case_type in ('onboarding','post_sale','renewal'));

alter table public.customer_success_cases
  add column if not exists health_score integer not null default 80
    check(health_score between 0 and 100);

alter table public.customer_success_cases
  add column if not exists due_at timestamptz;

alter table public.customer_success_cases
  add column if not exists renewal_at timestamptz;

alter table public.customer_success_cases
  add column if not exists next_action_at timestamptz;

alter table public.customer_success_cases
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists customer_success_tenant_status_idx
  on public.customer_success_cases(tenant_id,status,next_action_at);

create index if not exists customer_success_renewal_idx
  on public.customer_success_cases(tenant_id,renewal_at)
  where renewal_at is not null;

create table if not exists public.sales_playbooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  entity_type text not null default 'deal'
    check(entity_type in ('contact','deal','customer_success')),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_playbook_questions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  playbook_id uuid not null references public.sales_playbooks(id) on delete cascade,
  sort_order integer not null default 0,
  field_key text not null,
  label text not null,
  response_type text not null default 'text'
    check(response_type in ('text','textarea','number','boolean','select')),
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  unique(playbook_id,field_key)
);

create index if not exists sales_playbook_questions_idx
  on public.sales_playbook_questions(tenant_id,playbook_id,sort_order);

create table if not exists public.sales_playbook_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  playbook_id uuid not null references public.sales_playbooks(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  success_case_id uuid references public.customer_success_cases(id) on delete set null,
  responses jsonb not null default '{}'::jsonb,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists sales_playbook_runs_tenant_idx
  on public.sales_playbook_runs(tenant_id,completed_at desc);

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  list_name text,
  company_name text,
  contact_name text,
  document text,
  website text,
  email text,
  phone text,
  segment text,
  city text,
  state text,
  source text not null default 'Prospecção',
  status text not null default 'new'
    check(status in ('new','researching','qualified','converted','discarded')),
  assigned_to uuid references public.profiles(id) on delete set null,
  enrichment jsonb not null default '{}'::jsonb,
  converted_contact_id uuid references public.contacts(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prospects_tenant_status_idx
  on public.prospects(tenant_id,status,created_at desc);

create index if not exists prospects_tenant_company_idx
  on public.prospects(tenant_id,company_name);

alter table public.customer_success_cases enable row level security;
alter table public.sales_playbooks enable row level security;
alter table public.sales_playbook_questions enable row level security;
alter table public.sales_playbook_runs enable row level security;
alter table public.prospects enable row level security;

drop policy if exists customer_success_select on public.customer_success_cases;
create policy customer_success_select on public.customer_success_cases for select
using (public.has_tenant_access(tenant_id) and public.has_permission('deals.view'));

drop policy if exists customer_success_write on public.customer_success_cases;
create policy customer_success_write on public.customer_success_cases for all
using (public.has_tenant_access(tenant_id) and public.has_permission('deals.update'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('deals.update'));

drop policy if exists playbooks_select on public.sales_playbooks;
create policy playbooks_select on public.sales_playbooks for select
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.view'));

drop policy if exists playbooks_write on public.sales_playbooks;
create policy playbooks_write on public.sales_playbooks for all
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));

drop policy if exists playbook_questions_select on public.sales_playbook_questions;
create policy playbook_questions_select on public.sales_playbook_questions for select
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.view'));

drop policy if exists playbook_questions_write on public.sales_playbook_questions;
create policy playbook_questions_write on public.sales_playbook_questions for all
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));

drop policy if exists playbook_runs_select on public.sales_playbook_runs;
create policy playbook_runs_select on public.sales_playbook_runs for select
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.view'));

drop policy if exists playbook_runs_write on public.sales_playbook_runs;
create policy playbook_runs_write on public.sales_playbook_runs for all
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));

drop policy if exists prospects_select on public.prospects;
create policy prospects_select on public.prospects for select
using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.view'));

drop policy if exists prospects_write on public.prospects;
create policy prospects_write on public.prospects for all
using (
  public.has_tenant_access(tenant_id)
  and (public.has_permission('contacts.create') or public.has_permission('contacts.update'))
)
with check (
  public.has_tenant_access(tenant_id)
  and (public.has_permission('contacts.create') or public.has_permission('contacts.update'))
);
