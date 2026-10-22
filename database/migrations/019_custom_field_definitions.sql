-- Ecojoi CRM - campos personalizados administráveis.
-- Aditivo e multiempresa. Não altera credenciais nem remove estruturas existentes.

create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null check(entity_type in ('contacts','leads','deals','tasks')),
  field_key text not null,
  label text not null,
  field_type text not null check(field_type in ('text','textarea','number','date','boolean','select','email','phone','url')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,entity_type,field_key)
);

create index if not exists custom_fields_tenant_entity_idx
  on public.custom_field_definitions(tenant_id,entity_type,active,sort_order);

alter table public.custom_field_definitions enable row level security;

drop policy if exists custom_fields_select on public.custom_field_definitions;
create policy custom_fields_select on public.custom_field_definitions for select
using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.view'));

drop policy if exists custom_fields_write on public.custom_field_definitions;
create policy custom_fields_write on public.custom_field_definitions for all
using (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));

comment on table public.custom_field_definitions is
  'Definições administráveis de campos personalizados por tenant e entidade.';
