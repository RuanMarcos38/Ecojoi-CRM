-- Ecojoi CRM - contexto de IA, notas internas, uso e retenção de anexos.
-- Aditivo: preserva mensagens, histórico e credenciais existentes.

alter table public.conversations
  add column if not exists ai_summary text;

alter table public.conversations
  add column if not exists ai_next_action text;

alter table public.conversations
  add column if not exists ai_summary_updated_at timestamptz;

alter table public.tenant_settings
  add column if not exists attachment_retention_days integer not null default 365
    check(attachment_retention_days between 30 and 3650);

create table if not exists public.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists conversation_notes_conversation_idx
  on public.conversation_notes(tenant_id,conversation_id,created_at desc);

alter table public.conversation_notes enable row level security;

drop policy if exists conversation_notes_select on public.conversation_notes;
create policy conversation_notes_select on public.conversation_notes for select
using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.view'));

drop policy if exists conversation_notes_insert on public.conversation_notes;
create policy conversation_notes_insert on public.conversation_notes for insert
with check (
  public.has_tenant_access(tenant_id)
  and (
    public.has_permission('conversations.send')
    or public.has_permission('conversations.manage')
  )
);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  provider text not null default 'external',
  model text,
  input_tokens integer not null default 0 check(input_tokens >= 0),
  output_tokens integer not null default 0 check(output_tokens >= 0),
  total_tokens integer not null default 0 check(total_tokens >= 0),
  estimated_cost numeric(14,6) not null default 0 check(estimated_cost >= 0),
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_logs_tenant_created_idx
  on public.ai_usage_logs(tenant_id,created_at desc);

create index if not exists ai_usage_logs_conversation_idx
  on public.ai_usage_logs(tenant_id,conversation_id,created_at desc);

alter table public.ai_usage_logs enable row level security;

drop policy if exists ai_usage_logs_select on public.ai_usage_logs;
create policy ai_usage_logs_select on public.ai_usage_logs for select
using (
  public.has_tenant_access(tenant_id)
  and (
    public.has_permission('reports.view')
    or public.has_permission('settings.view')
  )
);

revoke insert,update,delete on public.ai_usage_logs from anon,authenticated;
grant select on public.ai_usage_logs to authenticated;
grant select,insert,update,delete on public.ai_usage_logs to service_role;

comment on column public.conversations.ai_summary is
  'Resumo operacional opcional produzido pelo agente IA ou integração externa.';

comment on column public.conversations.ai_next_action is
  'Próxima ação comercial sugerida pelo agente IA ou workflow.';

comment on column public.tenant_settings.attachment_retention_days is
  'Dias para manter arquivos físicos de anexos antes de limpeza automática; mensagens são preservadas.';
