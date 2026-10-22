-- Ecojoi CRM - Sales Operations Suite
-- Bloco aditivo: catálogo, propostas, sequências, NPS/CSAT e visualizações salvas.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sku text,
  name text not null,
  description text,
  unit text,
  price numeric(14,2) not null default 0,
  cost numeric(14,2),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, sku)
);

create index if not exists products_tenant_active_idx
  on public.products(tenant_id,active,name);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','accepted','rejected','expired')),
  currency text not null default 'BRL',
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  valid_until date,
  notes text,
  public_token uuid not null default gen_random_uuid() unique,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposals_tenant_status_idx
  on public.proposals(tenant_id,status,created_at desc);

create table if not exists public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(14,3) not null default 1,
  unit_price numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  sort_order integer not null default 0
);

create index if not exists proposal_items_proposal_idx
  on public.proposal_items(tenant_id,proposal_id,sort_order);

create table if not exists public.sales_sequences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sequence_id uuid not null references public.sales_sequences(id) on delete cascade,
  step_order integer not null,
  delay_minutes integer not null default 0 check(delay_minutes between 0 and 525600),
  action_type text not null check(action_type in ('task','whatsapp','email','internal_note')),
  template_body text,
  config jsonb not null default '{}'::jsonb,
  unique(sequence_id,step_order)
);

create index if not exists sequence_steps_idx
  on public.sales_sequence_steps(tenant_id,sequence_id,step_order);

create table if not exists public.sales_sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sequence_id uuid not null references public.sales_sequences(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  current_step integer not null default 0,
  status text not null default 'active'
    check (status in ('active','paused','completed','cancelled')),
  next_run_at timestamptz,
  enrolled_by uuid references public.profiles(id) on delete set null,
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sequence_id,contact_id,status)
);

create index if not exists sequence_enrollments_due_idx
  on public.sales_sequence_enrollments(tenant_id,status,next_run_at);

create table if not exists public.customer_surveys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  survey_type text not null check(survey_type in ('nps','csat')),
  question text not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_survey_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  survey_id uuid not null references public.customer_surveys(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  score integer not null check(score between 0 and 10),
  comment text,
  token uuid not null default gen_random_uuid() unique,
  submitted_at timestamptz not null default now()
);

create index if not exists survey_responses_tenant_idx
  on public.customer_survey_responses(tenant_id,survey_id,submitted_at desc);

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null check(entity_type in ('contacts','leads','deals','tasks','conversations')),
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,user_id,entity_type,name)
);

create index if not exists saved_views_user_idx
  on public.saved_views(tenant_id,user_id,entity_type);

alter table public.products enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_items enable row level security;
alter table public.sales_sequences enable row level security;
alter table public.sales_sequence_steps enable row level security;
alter table public.sales_sequence_enrollments enable row level security;
alter table public.customer_surveys enable row level security;
alter table public.customer_survey_responses enable row level security;
alter table public.saved_views enable row level security;

drop policy if exists products_select on public.products;
create policy products_select on public.products for select
using (public.has_tenant_access(tenant_id) and public.has_permission('deals.view'));
drop policy if exists products_write on public.products;
create policy products_write on public.products for all
using (public.has_tenant_access(tenant_id) and public.has_permission('deals.update'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('deals.update'));

drop policy if exists proposals_select on public.proposals;
create policy proposals_select on public.proposals for select
using (public.has_tenant_access(tenant_id) and public.has_permission('deals.view'));
drop policy if exists proposals_write on public.proposals;
create policy proposals_write on public.proposals for all
using (public.has_tenant_access(tenant_id) and public.has_permission('deals.update'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('deals.update'));

drop policy if exists proposal_items_select on public.proposal_items;
create policy proposal_items_select on public.proposal_items for select
using (public.has_tenant_access(tenant_id) and public.has_permission('deals.view'));
drop policy if exists proposal_items_write on public.proposal_items;
create policy proposal_items_write on public.proposal_items for all
using (public.has_tenant_access(tenant_id) and public.has_permission('deals.update'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('deals.update'));

drop policy if exists sequences_select on public.sales_sequences;
create policy sequences_select on public.sales_sequences for select
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.view'));
drop policy if exists sequences_write on public.sales_sequences;
create policy sequences_write on public.sales_sequences for all
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));

drop policy if exists sequence_steps_select on public.sales_sequence_steps;
create policy sequence_steps_select on public.sales_sequence_steps for select
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.view'));
drop policy if exists sequence_steps_write on public.sales_sequence_steps;
create policy sequence_steps_write on public.sales_sequence_steps for all
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));

drop policy if exists sequence_enrollments_select on public.sales_sequence_enrollments;
create policy sequence_enrollments_select on public.sales_sequence_enrollments for select
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.view'));
drop policy if exists sequence_enrollments_write on public.sales_sequence_enrollments;
create policy sequence_enrollments_write on public.sales_sequence_enrollments for all
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));

drop policy if exists surveys_select on public.customer_surveys;
create policy surveys_select on public.customer_surveys for select
using (public.has_tenant_access(tenant_id) and public.has_permission('reports.view'));
drop policy if exists surveys_write on public.customer_surveys;
create policy surveys_write on public.customer_surveys for all
using (public.has_tenant_access(tenant_id) and public.has_permission('reports.view'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('reports.view'));

drop policy if exists survey_responses_select on public.customer_survey_responses;
create policy survey_responses_select on public.customer_survey_responses for select
using (public.has_tenant_access(tenant_id) and public.has_permission('reports.view'));

drop policy if exists saved_views_select on public.saved_views;
create policy saved_views_select on public.saved_views for select
using (public.has_tenant_access(tenant_id) and user_id=(select auth.uid()));
drop policy if exists saved_views_write on public.saved_views;
create policy saved_views_write on public.saved_views for all
using (public.has_tenant_access(tenant_id) and user_id=(select auth.uid()))
with check (public.has_tenant_access(tenant_id) and user_id=(select auth.uid()));

create or replace function public.recalculate_proposal_total(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_tenant uuid;
  v_subtotal numeric(14,2);
  v_discount numeric(14,2);
begin
  select tenant_id,discount into v_tenant,v_discount
  from public.proposals where id=p_proposal_id;

  if v_tenant is null then return; end if;
  if not public.has_tenant_access(v_tenant) then raise exception 'forbidden'; end if;

  select coalesce(sum(total),0) into v_subtotal
  from public.proposal_items
  where proposal_id=p_proposal_id and tenant_id=v_tenant;

  update public.proposals
  set subtotal=v_subtotal,
      total=greatest(0,v_subtotal-coalesce(v_discount,0)),
      updated_at=now()
  where id=p_proposal_id and tenant_id=v_tenant;
end;
$$;

revoke all on function public.recalculate_proposal_total(uuid) from public,anon;
grant execute on function public.recalculate_proposal_total(uuid) to authenticated;
