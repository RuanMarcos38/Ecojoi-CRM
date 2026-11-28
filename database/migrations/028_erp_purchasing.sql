create table public.erp_suppliers (
  tenant_id uuid not null references public.tenants(id),
  id uuid not null default gen_random_uuid(),
  legal_name text not null check (length(trim(legal_name)) between 2 and 160),
  tax_document text check (tax_document ~ '^([0-9]{11}|[0-9]{14})$'),
  active boolean not null default true,
  primary key (tenant_id, id),
  unique (tenant_id, tax_document)
);

create table public.erp_purchase_orders (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  supplier_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'received', 'cancelled')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, supplier_id) references public.erp_suppliers (tenant_id, id)
);

create index erp_purchase_orders_supplier_idx on public.erp_purchase_orders (tenant_id, supplier_id);

create table public.erp_purchase_order_lines (
  tenant_id uuid not null,
  order_id uuid not null,
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  quantity_milli bigint not null check (quantity_milli between 1 and 999999999999),
  received_milli bigint not null default 0 check (received_milli between 0 and quantity_milli),
  unit_price_cents bigint not null check (unit_price_cents between 1 and 99999999999),
  primary key (tenant_id, order_id, id),
  foreign key (tenant_id, order_id) references public.erp_purchase_orders (tenant_id, id),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id)
);

create index erp_purchase_lines_product_idx on public.erp_purchase_order_lines (tenant_id, product_id);

create table public.erp_purchase_receipts (
  tenant_id uuid not null,
  id uuid not null,
  order_id uuid not null,
  line_id uuid not null,
  quantity_milli bigint not null check (quantity_milli > 0),
  payable_due_date date not null,
  payable_id uuid,
  stock_movement_id uuid not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, order_id, line_id) references public.erp_purchase_order_lines (tenant_id, order_id, id),
  foreign key (tenant_id, payable_id) references public.finance_titles (tenant_id, id)
);

create index erp_purchase_receipts_line_idx on public.erp_purchase_receipts (tenant_id, order_id, line_id);
create index erp_purchase_receipts_payable_idx on public.erp_purchase_receipts (tenant_id, payable_id) where payable_id is not null;

alter table public.erp_suppliers enable row level security;
alter table public.erp_purchase_orders enable row level security;
alter table public.erp_purchase_order_lines enable row level security;
alter table public.erp_purchase_receipts enable row level security;
revoke all on public.erp_suppliers, public.erp_purchase_orders, public.erp_purchase_order_lines, public.erp_purchase_receipts
  from public, anon, authenticated, service_role;
grant select, insert, update on public.erp_suppliers, public.erp_purchase_orders, public.erp_purchase_order_lines to service_role;
grant select, insert on public.erp_purchase_receipts to service_role;

create function public.receive_erp_purchase_line(
  p_tenant uuid, p_order uuid, p_line uuid, p_operation uuid,
  p_quantity bigint, p_due_date date, p_actor uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  order_state text;
  line public.erp_purchase_order_lines%rowtype;
  receipt public.erp_purchase_receipts%rowtype;
  cost_cents numeric;
  payable uuid;
  stock_movement uuid := gen_random_uuid();
begin
  select status into order_state from public.erp_purchase_orders
    where tenant_id = p_tenant and id = p_order for update;
  if not found then return 'not_found'; end if;

  select * into receipt from public.erp_purchase_receipts
    where tenant_id = p_tenant and id = p_operation;
  if found then
    if receipt.order_id = p_order and receipt.line_id = p_line and receipt.quantity_milli = p_quantity
      and receipt.payable_due_date = p_due_date then return 'ok'; end if;
    return 'conflict';
  end if;
  if order_state <> 'approved' then return 'not_approved'; end if;

  select * into line from public.erp_purchase_order_lines
    where tenant_id = p_tenant and order_id = p_order and id = p_line for update;
  if not found then return 'not_found'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > line.quantity_milli - line.received_milli
    or p_due_date is null then return 'invalid_receipt'; end if;

  -- Differences of cumulative amounts prevent losing or adding cents on partial receipts.
  cost_cents := round((line.received_milli + p_quantity)::numeric * line.unit_price_cents / 1000)
    - round(line.received_milli::numeric * line.unit_price_cents / 1000);
  if cost_cents > 99999999999 then return 'value_limit'; end if;

  -- A separate stock ID avoids colliding with an unrelated manual stock movement.
  if public.record_erp_stock_movement(p_tenant, line.product_id, stock_movement,
    p_quantity, 'Recebimento de compra', p_actor) <> 'ok' then return 'stock_limit'; end if;

  if cost_cents > 0 then
    payable := gen_random_uuid();
    insert into public.finance_titles(tenant_id,id,direction,description,due_date,amount_cents,created_by)
      values(p_tenant,payable,'payable','Recebimento de compra',p_due_date,cost_cents::bigint,p_actor);
  end if;

  insert into public.erp_purchase_receipts(tenant_id,id,order_id,line_id,quantity_milli,payable_due_date,payable_id,stock_movement_id,created_by)
    values(p_tenant,p_operation,p_order,p_line,p_quantity,p_due_date,payable,stock_movement,p_actor);

  update public.erp_purchase_order_lines set received_milli = received_milli + p_quantity
    where tenant_id = p_tenant and order_id = p_order and id = p_line;
  if not exists (select 1 from public.erp_purchase_order_lines
    where tenant_id = p_tenant and order_id = p_order and received_milli < quantity_milli) then
    update public.erp_purchase_orders set status = 'received' where tenant_id = p_tenant and id = p_order;
  end if;
  return 'ok';
end;
$$;

revoke all on function public.receive_erp_purchase_line(uuid,uuid,uuid,uuid,bigint,date,uuid) from public, anon, authenticated;
grant execute on function public.receive_erp_purchase_line(uuid,uuid,uuid,uuid,bigint,date,uuid) to service_role;

create function public.create_erp_purchase_order(
  p_tenant uuid, p_order uuid, p_supplier uuid, p_product uuid,
  p_quantity bigint, p_price bigint, p_actor uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.erp_suppliers
      where tenant_id = p_tenant and id = p_supplier and active)
    or not exists (select 1 from public.products
      where tenant_id = p_tenant and id = p_product and active) then
    return 'not_found';
  end if;

  insert into public.erp_purchase_orders (tenant_id, id, supplier_id, created_by)
    values (p_tenant, p_order, p_supplier, p_actor)
    on conflict (tenant_id, id) do nothing;
  if not found then
    if exists (
      select 1 from public.erp_purchase_orders o
      join public.erp_purchase_order_lines l on l.tenant_id = o.tenant_id and l.order_id = o.id
      where o.tenant_id = p_tenant and o.id = p_order and o.supplier_id = p_supplier
        and l.product_id = p_product and l.quantity_milli = p_quantity and l.unit_price_cents = p_price
    ) then return 'ok'; end if;
    return 'conflict';
  end if;

  insert into public.erp_purchase_order_lines
    (tenant_id, order_id, product_id, quantity_milli, unit_price_cents)
    values (p_tenant, p_order, p_product, p_quantity, p_price);
  return 'ok';
end;
$$;

revoke all on function public.create_erp_purchase_order(uuid,uuid,uuid,uuid,bigint,bigint,uuid) from public, anon, authenticated;
grant execute on function public.create_erp_purchase_order(uuid,uuid,uuid,uuid,bigint,bigint,uuid) to service_role;
