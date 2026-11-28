create table public.finance_titles (
  tenant_id uuid not null references public.tenants(id),
  id uuid not null,
  direction text not null check (direction in ('receivable', 'payable')),
  description text not null check (length(trim(description)) between 2 and 160),
  due_date date not null,
  amount_cents bigint not null check (amount_cents between 1 and 99999999999),
  settled_cents bigint not null default 0 check (settled_cents between 0 and amount_cents),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

create index finance_titles_by_due_date on public.finance_titles (tenant_id, due_date, id);

create table public.finance_settlements (
  tenant_id uuid not null,
  title_id uuid not null,
  id uuid not null,
  amount_cents bigint not null check (amount_cents between 1 and 99999999999),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, title_id, id),
  foreign key (tenant_id, title_id) references public.finance_titles (tenant_id, id)
);

alter table public.finance_titles enable row level security;
alter table public.finance_settlements enable row level security;
revoke all on public.finance_titles, public.finance_settlements from public, anon, authenticated, service_role;
grant select, insert, update on public.finance_titles to service_role;
grant select, insert on public.finance_settlements to service_role;

create function public.record_finance_settlement(
  p_tenant uuid, p_title uuid, p_operation uuid, p_amount bigint, p_actor uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  title public.finance_titles%rowtype;
  existing_amount bigint;
begin
  select * into title from public.finance_titles
    where tenant_id = p_tenant and id = p_title for update;
  if not found then return 'not_found'; end if;

  select amount_cents into existing_amount from public.finance_settlements
    where tenant_id = p_tenant and title_id = p_title and id = p_operation;
  if found then
    if existing_amount = p_amount then return 'ok'; end if;
    return 'conflict';
  end if;

  if p_amount <= 0 or p_amount > title.amount_cents - title.settled_cents then
    return 'insufficient_balance';
  end if;

  insert into public.finance_settlements (tenant_id, title_id, id, amount_cents, created_by)
    values (p_tenant, p_title, p_operation, p_amount, p_actor);
  update public.finance_titles set settled_cents = settled_cents + p_amount
    where tenant_id = p_tenant and id = p_title;
  return 'ok';
end;
$$;

revoke all on function public.record_finance_settlement(uuid, uuid, uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.record_finance_settlement(uuid, uuid, uuid, bigint, uuid) to service_role;
