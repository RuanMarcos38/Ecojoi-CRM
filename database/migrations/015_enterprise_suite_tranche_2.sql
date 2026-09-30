-- Ecojoi CRM - Enterprise suite tranche 2
-- Compatível com estruturas já existentes no banco. Somente adições seguras.

-- Estruturas já existentes em produção: products, proposals, proposal_items,
-- custom_field_definitions e saved_views. Mantemos os formatos atuais.
alter table public.saved_views
  add column if not exists sort jsonb not null default '{}'::jsonb;

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,name)
);

create table if not exists public.pipeline_stages_v2 (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  stage_key text not null,
  sort_order integer not null default 0,
  probability integer not null default 10 check(probability between 0 and 100),
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  unique(pipeline_id,stage_key)
);

create index if not exists pipeline_stages_v2_pipeline_idx
  on public.pipeline_stages_v2(pipeline_id,sort_order);

alter table public.deals add column if not exists pipeline_id uuid references public.pipelines(id) on delete set null;
alter table public.deals add column if not exists pipeline_stage_id uuid references public.pipeline_stages_v2(id) on delete set null;
alter table public.deals add column if not exists lost_reason_id uuid;
alter table public.deals add column if not exists closed_at timestamptz;
create index if not exists deals_pipeline_idx on public.deals(tenant_id,pipeline_id,pipeline_stage_id);

create table if not exists public.loss_reasons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(tenant_id,name)
);

do $$
begin
  if not exists(select 1 from pg_constraint where conname='deals_lost_reason_id_fkey') then
    alter table public.deals add constraint deals_lost_reason_id_fkey
      foreign key(lost_reason_id) references public.loss_reasons(id) on delete set null;
  end if;
end $$;

-- Materializa no versionamento as tabelas que já podem existir em produção.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sku text,
  name text not null,
  description text,
  unit text not null default 'un',
  price numeric(14,2) not null default 0,
  cost numeric(14,2),
  active boolean not null default true,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_tenant_sku_uidx
  on public.products(tenant_id,sku) where sku is not null;
create index if not exists products_tenant_active_idx on public.products(tenant_id,active,name);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  proposal_number text,
  title text not null,
  status text not null default 'draft',
  currency text not null default 'BRL',
  subtotal numeric(14,2) not null default 0,
  discount_percent numeric(8,3) not null default 0,
  discount_value numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  valid_until date,
  notes text,
  terms text,
  public_token uuid not null default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  accepted_at timestamptz,
  accepted_name text,
  accepted_email text,
  accepted_ip text,
  accepted_user_agent text,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposals_tenant_status_idx on public.proposals(tenant_id,status,created_at desc);
create unique index if not exists proposals_public_token_uidx on public.proposals(public_token);

create table if not exists public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(12,3) not null default 1,
  unit_price numeric(14,2) not null default 0,
  discount_percent numeric(8,3) not null default 0,
  line_total numeric(14,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists proposal_items_proposal_idx on public.proposal_items(proposal_id,sort_order);

create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null,
  field_key text not null,
  label text not null,
  field_type text not null,
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,entity_type,field_key)
);

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  entity_type text not null,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  sort jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_views_user_idx on public.saved_views(tenant_id,user_id,entity_type);

create table if not exists public.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversation_notes_conversation_idx
  on public.conversation_notes(tenant_id,conversation_id,created_at);

create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  survey_type text not null check(survey_type in ('nps','csat')),
  question text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  survey_id uuid not null references public.surveys(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  score integer not null,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists survey_responses_tenant_idx
  on public.survey_responses(tenant_id,created_at desc);

create table if not exists public.public_forms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  source text,
  fields jsonb not null default '[]'::jsonb,
  success_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  form_id uuid not null references public.public_forms(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  source_ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists form_submissions_tenant_idx
  on public.form_submissions(tenant_id,form_id,created_at desc);

create table if not exists public.webchat_widgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  public_key text not null unique,
  active boolean not null default true,
  welcome_message text,
  accent_color text,
  allowed_origins text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid not null references public.webhook_subscriptions(id) on delete cascade,
  event_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check(status in ('pending','processing','sent','failed','dead_letter')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists webhook_jobs_due_idx
  on public.webhook_delivery_jobs(status,next_attempt_at)
  where status in ('pending','failed');

-- RLS
alter table public.pipelines enable row level security;
alter table public.pipeline_stages_v2 enable row level security;
alter table public.loss_reasons enable row level security;
alter table public.products enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_items enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.saved_views enable row level security;
alter table public.conversation_notes enable row level security;
alter table public.surveys enable row level security;
alter table public.survey_responses enable row level security;
alter table public.public_forms enable row level security;
alter table public.form_submissions enable row level security;
alter table public.webchat_widgets enable row level security;
alter table public.webhook_delivery_jobs enable row level security;

-- Selects
drop policy if exists pipelines_select on public.pipelines;
create policy pipelines_select on public.pipelines for select
using(public.has_tenant_access(tenant_id) and public.has_permission('deals.view'));
drop policy if exists pipeline_stages_v2_select on public.pipeline_stages_v2;
create policy pipeline_stages_v2_select on public.pipeline_stages_v2 for select
using(public.has_tenant_access(tenant_id) and public.has_permission('deals.view'));
drop policy if exists loss_reasons_select on public.loss_reasons;
create policy loss_reasons_select on public.loss_reasons for select
using(public.has_tenant_access(tenant_id) and public.has_permission('deals.view'));
drop policy if exists products_select on public.products;
create policy products_select on public.products for select
using(public.has_tenant_access(tenant_id) and public.has_permission('deals.view'));
drop policy if exists proposals_select on public.proposals;
create policy proposals_select on public.proposals for select
using(public.has_tenant_access(tenant_id) and public.has_permission('deals.view'));
drop policy if exists proposal_items_select on public.proposal_items;
create policy proposal_items_select on public.proposal_items for select
using(public.has_tenant_access(tenant_id) and public.has_permission('deals.view'));
drop policy if exists field_defs_select on public.custom_field_definitions;
create policy field_defs_select on public.custom_field_definitions for select
using(public.has_tenant_access(tenant_id));
drop policy if exists saved_views_select on public.saved_views;
create policy saved_views_select on public.saved_views for select
using(public.has_tenant_access(tenant_id) and (user_id is null or user_id=(select auth.uid())));
drop policy if exists conversation_notes_select on public.conversation_notes;
create policy conversation_notes_select on public.conversation_notes for select
using(public.has_tenant_access(tenant_id) and public.has_permission('conversations.view'));
drop policy if exists surveys_select on public.surveys;
create policy surveys_select on public.surveys for select
using(public.has_tenant_access(tenant_id));
drop policy if exists survey_responses_select on public.survey_responses;
create policy survey_responses_select on public.survey_responses for select
using(public.has_tenant_access(tenant_id) and public.has_permission('contacts.view'));
drop policy if exists public_forms_select on public.public_forms;
create policy public_forms_select on public.public_forms for select
using(public.has_tenant_access(tenant_id) and public.has_permission('settings.view'));
drop policy if exists form_submissions_select on public.form_submissions;
create policy form_submissions_select on public.form_submissions for select
using(public.has_tenant_access(tenant_id) and public.has_permission('contacts.view'));
drop policy if exists webchat_widgets_select on public.webchat_widgets;
create policy webchat_widgets_select on public.webchat_widgets for select
using(public.has_tenant_access(tenant_id) and public.has_permission('settings.view'));
drop policy if exists webhook_delivery_jobs_select on public.webhook_delivery_jobs;
create policy webhook_delivery_jobs_select on public.webhook_delivery_jobs for select
using(public.has_tenant_access(tenant_id) and public.has_permission('settings.view'));

-- Writes (intentionally narrow)
drop policy if exists pipelines_write on public.pipelines;
create policy pipelines_write on public.pipelines for all
using(public.has_tenant_access(tenant_id) and public.has_permission('deals.update'))
with check(public.has_tenant_access(tenant_id) and public.has_permission('deals.update'));
drop policy if exists pipeline_stages_v2_write on public.pipeline_stages_v2;
create policy pipeline_stages_v2_write on public.pipeline_stages_v2 for all
using(public.has_tenant_access(tenant_id) and public.has_permission('deals.update'))
with check(public.has_tenant_access(tenant_id) and public.has_permission('deals.update'));
drop policy if exists loss_reasons_write on public.loss_reasons;
create policy loss_reasons_write on public.loss_reasons for all
using(public.has_tenant_access(tenant_id) and public.has_permission('deals.update'))
with check(public.has_tenant_access(tenant_id) and public.has_permission('deals.update'));
drop policy if exists products_write on public.products;
create policy products_write on public.products for all
using(public.has_tenant_access(tenant_id) and public.has_permission('deals.update'))
with check(public.has_tenant_access(tenant_id) and public.has_permission('deals.update'));
drop policy if exists proposals_write on public.proposals;
create policy proposals_write on public.proposals for all
using(public.has_tenant_access(tenant_id) and public.has_permission('deals.update'))
with check(public.has_tenant_access(tenant_id) and public.has_permission('deals.update'));
drop policy if exists proposal_items_write on public.proposal_items;
create policy proposal_items_write on public.proposal_items for all
using(public.has_tenant_access(tenant_id) and public.has_permission('deals.update'))
with check(public.has_tenant_access(tenant_id) and public.has_permission('deals.update'));
drop policy if exists field_defs_write on public.custom_field_definitions;
create policy field_defs_write on public.custom_field_definitions for all
using(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'))
with check(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));
drop policy if exists saved_views_write on public.saved_views;
create policy saved_views_write on public.saved_views for all
using(public.has_tenant_access(tenant_id) and (user_id is null or user_id=(select auth.uid())))
with check(public.has_tenant_access(tenant_id) and (user_id is null or user_id=(select auth.uid())));
drop policy if exists conversation_notes_write on public.conversation_notes;
create policy conversation_notes_write on public.conversation_notes for all
using(public.has_tenant_access(tenant_id) and public.has_permission('conversations.view'))
with check(public.has_tenant_access(tenant_id) and public.has_permission('conversations.view'));
drop policy if exists surveys_write on public.surveys;
create policy surveys_write on public.surveys for all
using(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'))
with check(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));
drop policy if exists survey_responses_write on public.survey_responses;
create policy survey_responses_write on public.survey_responses for all
using(public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'))
with check(public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'));
drop policy if exists public_forms_write on public.public_forms;
create policy public_forms_write on public.public_forms for all
using(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'))
with check(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));
drop policy if exists webchat_widgets_write on public.webchat_widgets;
create policy webchat_widgets_write on public.webchat_widgets for all
using(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'))
with check(public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));

-- Funil padrão por tenant, sem alterar negócios existentes.
insert into public.pipelines(tenant_id,name,description,is_default)
select t.id,'Comercial','Funil comercial padrão',true
from public.tenants t
where not exists(select 1 from public.pipelines p where p.tenant_id=t.id);

insert into public.pipeline_stages_v2(tenant_id,pipeline_id,name,stage_key,sort_order,probability,is_won,is_lost)
select p.tenant_id,p.id,s.name,s.stage_key,s.sort_order,s.probability,s.is_won,s.is_lost
from public.pipelines p
cross join (values
  ('Novo','new',10,10,false,false),
  ('Qualificação','qualification',20,25,false,false),
  ('Proposta','proposal',30,60,false,false),
  ('Fechamento','closing',40,80,false,false),
  ('Ganho','won',50,100,true,false),
  ('Perdido','lost',60,0,false,true)
) as s(name,stage_key,sort_order,probability,is_won,is_lost)
where p.is_default=true
on conflict(pipeline_id,stage_key) do nothing;

update public.deals d
set pipeline_id=p.id,
    pipeline_stage_id=s.id
from public.pipelines p
join public.pipeline_stages_v2 s on s.pipeline_id=p.id
where d.tenant_id=p.tenant_id
  and p.is_default=true
  and s.stage_key=d.stage
  and d.pipeline_id is null;
