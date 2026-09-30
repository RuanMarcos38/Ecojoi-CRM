-- Ecojoi CRM - governança de IA e retenção operacional.
alter table public.tenant_settings
  add column if not exists ai_daily_message_limit integer not null default 1000
    check(ai_daily_message_limit between 0 and 1000000);

alter table public.tenant_settings
  add column if not exists attachment_retention_days integer not null default 365
    check(attachment_retention_days between 1 and 3650);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  provider text not null default 'n8n',
  model text,
  event_type text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost numeric(14,6) not null default 0,
  latency_ms integer,
  success boolean not null default true,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_logs_tenant_created_idx
  on public.ai_usage_logs(tenant_id,created_at desc);
create index if not exists ai_usage_logs_conversation_idx
  on public.ai_usage_logs(conversation_id) where conversation_id is not null;

alter table public.ai_usage_logs enable row level security;
drop policy if exists ai_usage_logs_select on public.ai_usage_logs;
create policy ai_usage_logs_select on public.ai_usage_logs for select
using(public.has_tenant_access(tenant_id) and public.has_permission('settings.view'));

create or replace function public.ai_daily_usage(p_tenant_id uuid)
returns integer
language sql
security definer
set search_path=pg_catalog,public
as $$
  select count(*)::integer
  from public.ai_usage_logs
  where tenant_id=p_tenant_id
    and created_at >= date_trunc('day',now());
$$;

revoke all on function public.ai_daily_usage(uuid) from public,anon,authenticated;
grant execute on function public.ai_daily_usage(uuid) to service_role;
