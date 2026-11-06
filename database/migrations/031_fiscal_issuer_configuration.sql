create table public.fiscal_issuer_configuration (
  tenant_id uuid primary key references public.tenants(id),
  state_code text not null check (state_code in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR',
    'PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  )),
  state_registration text not null check (state_registration ~ '^[0-9]{2,14}$'),
  tax_regime text not null check (tax_regime in ('1','2','3','4')),
  municipality_code text not null check (municipality_code ~ '^[0-9]{7}$'),
  postal_code text not null check (postal_code ~ '^[0-9]{8}$'),
  address_line text not null check (length(trim(address_line)) between 3 and 160),
  integration_method text not null check (integration_method in ('provider','direct')),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);

alter table public.fiscal_issuer_configuration enable row level security;
revoke all on public.fiscal_issuer_configuration from public, anon, authenticated, service_role;
grant select, insert, update on public.fiscal_issuer_configuration to service_role;
