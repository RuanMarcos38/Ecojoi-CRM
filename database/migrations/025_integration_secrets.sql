-- Ecojoi CRM - credenciais server-side para integrações externas.
-- A tabela fica inacessível para anon/authenticated; somente service_role pode ler/escrever.

create table if not exists public.integration_secrets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, provider)
);

do $$ begin
  alter table public.integration_secrets
    add constraint integration_secrets_provider_check
    check (provider in ('evolution'));
exception when duplicate_object then null; end $$;

create index if not exists integration_secrets_tenant_provider_idx
  on public.integration_secrets(tenant_id, provider);

alter table public.integration_secrets enable row level security;

revoke all on table public.integration_secrets from public, anon, authenticated;
grant select, insert, update, delete on table public.integration_secrets to service_role;

drop policy if exists integration_secrets_service_role on public.integration_secrets;
create policy integration_secrets_service_role on public.integration_secrets
for all to service_role
using (true)
with check (true);

comment on table public.integration_secrets is
  'Credenciais de integrações usadas somente no backend com service_role; nunca retornar ao frontend.';
