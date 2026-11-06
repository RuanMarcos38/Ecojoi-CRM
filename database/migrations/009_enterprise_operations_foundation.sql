-- Ecojoi CRM - Enterprise Operations Foundation
-- Alterações aditivas. Nenhuma credencial, dado ou estrutura existente é removida.

alter table public.tenant_settings
  add column if not exists sla_first_response_minutes integer not null default 10;

alter table public.tenant_settings
  add column if not exists ai_agent_config jsonb not null default '{}'::jsonb;

alter table public.tenant_settings
  add column if not exists notification_preferences jsonb not null default '{}'::jsonb;

alter table public.profiles
  add column if not exists availability_state text not null default 'online'
    check (availability_state in ('online','busy','break','offline'));

alter table public.profiles
  add column if not exists max_open_conversations integer not null default 30
    check (max_open_conversations between 1 and 500);

alter table public.conversations
  add column if not exists last_inbound_at timestamptz;

alter table public.conversations
  add column if not exists last_outbound_at timestamptz;

alter table public.conversations
  add column if not exists first_response_at timestamptz;

alter table public.conversations
  add column if not exists sla_due_at timestamptz;

alter table public.contacts
  add column if not exists lead_score integer not null default 0
    check (lead_score between 0 and 100);

alter table public.contacts
  add column if not exists lead_temperature text not null default 'cold'
    check (lead_temperature in ('cold','warm','hot'));

alter table public.contacts
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

alter table public.contacts
  add column if not exists consent_status text not null default 'unknown'
    check (consent_status in ('unknown','opt_in','opt_out'));

alter table public.contacts
  add column if not exists consent_at timestamptz;

alter table public.contacts
  add column if not exists organization_id uuid;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  legal_name text,
  document text,
  website text,
  phone text,
  email text,
  segment text,
  size text,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='contacts_organization_id_fkey'
  ) then
    alter table public.contacts
      add constraint contacts_organization_id_fkey
      foreign key (organization_id) references public.organizations(id) on delete set null;
  end if;
end $$;

create index if not exists organizations_tenant_name_idx on public.organizations(tenant_id,name);
create index if not exists contacts_tenant_score_idx on public.contacts(tenant_id,lead_score desc);
create index if not exists contacts_tenant_temperature_idx on public.contacts(tenant_id,lead_temperature);
create index if not exists contacts_organization_idx on public.contacts(tenant_id,organization_id);
create index if not exists conversations_tenant_sla_idx on public.conversations(tenant_id,sla_due_at)
  where status <> 'closed';

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique(tenant_id,name)
);

create table if not exists public.contact_tags (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(contact_id,tag_id)
);

create index if not exists contact_tags_tenant_contact_idx on public.contact_tags(tenant_id,contact_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id text,
  priority text not null default 'normal'
    check (priority in ('low','normal','high','critical')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications(tenant_id,user_id,created_at desc)
  where read_at is null;

create table if not exists public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  shortcut text not null,
  title text not null,
  body text not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,shortcut)
);

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  meta_template_id text,
  name text not null,
  language text not null default 'pt_BR',
  category text,
  status text,
  components jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,name,language)
);

create index if not exists whatsapp_templates_tenant_status_idx
  on public.whatsapp_templates(tenant_id,status);

create table if not exists public.outbound_message_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  channel text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed','dead_letter')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outbound_queue_due_idx
  on public.outbound_message_queue(status,next_attempt_at)
  where status in ('pending','failed');

create index if not exists outbound_queue_tenant_idx
  on public.outbound_message_queue(tenant_id,created_at desc);

create table if not exists public.webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  endpoint_url text not null,
  secret_hash text,
  events text[] not null default '{}',
  active boolean not null default true,
  last_status integer,
  last_delivery_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid not null references public.webhook_subscriptions(id) on delete cascade,
  event_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','sent','failed')),
  attempts integer not null default 0,
  response_status integer,
  error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists webhook_deliveries_tenant_created_idx
  on public.webhook_deliveries(tenant_id,created_at desc);

create table if not exists public.n8n_workflow_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workflow_id text,
  workflow_name text not null,
  version_number integer not null,
  workflow_json jsonb not null,
  imported_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(tenant_id,workflow_name,version_number)
);

create table if not exists public.n8n_execution_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workflow_id text,
  conversation_id uuid references public.conversations(id) on delete set null,
  event_type text not null,
  status text not null
    check (status in ('started','success','failed')),
  duration_ms integer,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists n8n_exec_tenant_created_idx
  on public.n8n_execution_logs(tenant_id,created_at desc);

create table if not exists public.ai_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  storage_path text,
  mime_type text,
  extracted_text text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_knowledge_tenant_active_idx
  on public.ai_knowledge_documents(tenant_id,active);

create table if not exists public.sales_goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  revenue_target numeric(14,2) not null default 0,
  deals_target integer not null default 0,
  leads_target integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_goals_tenant_period_idx
  on public.sales_goals(tenant_id,period_start,period_end);

alter table public.api_keys
  add column if not exists scopes text[] not null default array['leads:read','leads:write'];

alter table public.api_keys
  add column if not exists rate_limit_per_minute integer not null default 120
    check (rate_limit_per_minute between 1 and 10000);

alter table public.organizations enable row level security;
alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.notifications enable row level security;
alter table public.quick_replies enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.outbound_message_queue enable row level security;
alter table public.webhook_subscriptions enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.n8n_workflow_versions enable row level security;
alter table public.n8n_execution_logs enable row level security;
alter table public.ai_knowledge_documents enable row level security;
alter table public.sales_goals enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select
using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.view'));
drop policy if exists organizations_write on public.organizations;
create policy organizations_write on public.organizations for all
using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'));

drop policy if exists tags_select on public.tags;
create policy tags_select on public.tags for select
using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.view'));
drop policy if exists tags_write on public.tags;
create policy tags_write on public.tags for all
using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'));

drop policy if exists contact_tags_select on public.contact_tags;
create policy contact_tags_select on public.contact_tags for select
using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.view'));
drop policy if exists contact_tags_write on public.contact_tags;
create policy contact_tags_write on public.contact_tags for all
using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'));

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select
using (
  public.has_tenant_access(tenant_id)
  and (user_id is null or user_id=auth.uid())
);
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update
using (
  public.has_tenant_access(tenant_id)
  and (user_id is null or user_id=auth.uid())
)
with check (
  public.has_tenant_access(tenant_id)
  and (user_id is null or user_id=auth.uid())
);

drop policy if exists quick_replies_select on public.quick_replies;
create policy quick_replies_select on public.quick_replies for select
using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.view'));
drop policy if exists quick_replies_write on public.quick_replies;
create policy quick_replies_write on public.quick_replies for all
using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'));

drop policy if exists whatsapp_templates_select on public.whatsapp_templates;
create policy whatsapp_templates_select on public.whatsapp_templates for select
using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.view'));
drop policy if exists whatsapp_templates_write on public.whatsapp_templates;
create policy whatsapp_templates_write on public.whatsapp_templates for all
using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'));

drop policy if exists outbound_queue_select on public.outbound_message_queue;
create policy outbound_queue_select on public.outbound_message_queue for select
using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'));

drop policy if exists webhook_subscriptions_select on public.webhook_subscriptions;
create policy webhook_subscriptions_select on public.webhook_subscriptions for select
using (public.has_tenant_access(tenant_id) and public.has_permission('settings.view'));
drop policy if exists webhook_subscriptions_write on public.webhook_subscriptions;
create policy webhook_subscriptions_write on public.webhook_subscriptions for all
using (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));

drop policy if exists webhook_deliveries_select on public.webhook_deliveries;
create policy webhook_deliveries_select on public.webhook_deliveries for select
using (public.has_tenant_access(tenant_id) and public.has_permission('settings.view'));

drop policy if exists n8n_versions_select on public.n8n_workflow_versions;
create policy n8n_versions_select on public.n8n_workflow_versions for select
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.view'));
drop policy if exists n8n_versions_write on public.n8n_workflow_versions;
create policy n8n_versions_write on public.n8n_workflow_versions for all
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));

drop policy if exists n8n_exec_select on public.n8n_execution_logs;
create policy n8n_exec_select on public.n8n_execution_logs for select
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.view'));

drop policy if exists knowledge_select on public.ai_knowledge_documents;
create policy knowledge_select on public.ai_knowledge_documents for select
using (public.has_tenant_access(tenant_id) and public.has_permission('settings.view'));
drop policy if exists knowledge_write on public.ai_knowledge_documents;
create policy knowledge_write on public.ai_knowledge_documents for all
using (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));

drop policy if exists goals_select on public.sales_goals;
create policy goals_select on public.sales_goals for select
using (public.has_tenant_access(tenant_id) and public.has_permission('reports.view'));
drop policy if exists goals_write on public.sales_goals;
create policy goals_write on public.sales_goals for all
using (public.has_tenant_access(tenant_id) and public.has_permission('reports.view'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('reports.view'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

create or replace function public.set_conversation_sla()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
declare
  v_minutes integer := 10;
begin
  if new.last_inbound_at is distinct from old.last_inbound_at and new.last_inbound_at is not null then
    select coalesce(ts.sla_first_response_minutes,10)
      into v_minutes
    from public.tenant_settings ts
    where ts.tenant_id=new.tenant_id;
    new.sla_due_at := new.last_inbound_at + make_interval(mins=>v_minutes);
  end if;

  if new.first_response_at is not null then
    new.sla_due_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists conversations_set_sla on public.conversations;
create trigger conversations_set_sla
before update on public.conversations
for each row execute function public.set_conversation_sla();

create or replace function public.create_sla_notifications()
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select c.id,c.tenant_id,c.assigned_to,ct.name
    from public.conversations c
    join public.contacts ct on ct.id=c.contact_id and ct.tenant_id=c.tenant_id
    where c.status <> 'closed'
      and c.sla_due_at is not null
      and c.sla_due_at <= now()
      and c.first_response_at is null
      and not exists (
        select 1 from public.notifications n
        where n.tenant_id=c.tenant_id
          and n.entity_type='conversation'
          and n.entity_id=c.id::text
          and n.type='sla_first_response_breached'
      )
  loop
    insert into public.notifications(
      tenant_id,user_id,type,title,body,entity_type,entity_id,priority
    ) values(
      r.tenant_id,r.assigned_to,'sla_first_response_breached',
      'SLA de atendimento excedido',
      'O lead '||coalesce(r.name,'Contato')||' está aguardando resposta.',
      'conversation',r.id::text,'high'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.create_sla_notifications() from public,anon,authenticated;
grant execute on function public.create_sla_notifications() to service_role;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='ecojoi_sla_notifications_1min' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule(
    'ecojoi_sla_notifications_1min',
    '* * * * *',
    'select public.create_sla_notifications();'
  );
end $$;
