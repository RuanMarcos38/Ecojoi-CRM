create unique index products_tenant_id_id_unique on public.products (tenant_id, id);

create table public.erp_stock_movements (
  tenant_id uuid not null,
  product_id uuid not null,
  id uuid not null,
  delta_milli bigint not null check (delta_milli between -999999999999 and 999999999999 and delta_milli <> 0),
  balance_milli bigint not null check (balance_milli between 0 and 999999999999),
  reason text not null check (length(trim(reason)) between 2 and 160),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  sequence_id bigint generated always as identity,
  primary key (tenant_id, product_id, id),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id)
);

create index erp_stock_movements_balance_idx
  on public.erp_stock_movements (tenant_id, product_id, sequence_id desc);

alter table public.erp_stock_movements enable row level security;
revoke all on public.erp_stock_movements from public, anon, authenticated, service_role;
grant select, insert on public.erp_stock_movements to service_role;

create function public.record_erp_stock_movement(
  p_tenant uuid, p_product uuid, p_operation uuid, p_delta bigint, p_reason text, p_actor uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous public.erp_stock_movements%rowtype;
  next_balance bigint;
begin
  -- Serialize movements for this product, including its first movement.
  perform 1 from public.products where tenant_id = p_tenant and id = p_product for update;
  if not found then return 'not_found'; end if;

  select * into previous from public.erp_stock_movements
    where tenant_id = p_tenant and product_id = p_product and id = p_operation;
  if found then
    if previous.delta_milli = p_delta and previous.reason = trim(p_reason) then return 'ok'; end if;
    return 'conflict';
  end if;

  select balance_milli into next_balance from public.erp_stock_movements
    where tenant_id = p_tenant and product_id = p_product order by sequence_id desc limit 1;
  if p_delta is null or p_delta = 0 or p_delta not between -999999999999 and 999999999999 then
    return 'invalid_quantity';
  end if;
  next_balance := coalesce(next_balance, 0) + p_delta;
  if next_balance not between 0 and 999999999999 then return 'invalid_balance'; end if;

  insert into public.erp_stock_movements (tenant_id, product_id, id, delta_milli, balance_milli, reason, created_by)
    values (p_tenant, p_product, p_operation, p_delta, next_balance, trim(p_reason), p_actor);
  return 'ok';
end;
$$;

revoke all on function public.record_erp_stock_movement(uuid, uuid, uuid, bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.record_erp_stock_movement(uuid, uuid, uuid, bigint, text, uuid) to service_role;
