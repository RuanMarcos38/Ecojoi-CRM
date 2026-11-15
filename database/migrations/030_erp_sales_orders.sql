create table public.erp_sales_orders (
  tenant_id uuid not null references public.tenants(id),
  id uuid not null default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id),
  contact_id uuid,
  title text not null,
  currency text not null,
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount numeric(14,2) not null check (discount >= 0),
  total numeric(14,2) not null check (total >= 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, proposal_id)
);

create index erp_sales_orders_by_date on public.erp_sales_orders (tenant_id, created_at desc, id);

create table public.erp_sales_order_lines (
  tenant_id uuid not null,
  order_id uuid not null,
  source_item_id uuid not null,
  product_id uuid,
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount numeric(14,2) not null check (discount >= 0),
  total numeric(14,2) not null check (total >= 0),
  sort_order integer not null,
  primary key (tenant_id, order_id, source_item_id),
  foreign key (tenant_id, order_id) references public.erp_sales_orders (tenant_id, id)
);

alter table public.erp_sales_orders enable row level security;
alter table public.erp_sales_order_lines enable row level security;
revoke all on public.erp_sales_orders, public.erp_sales_order_lines from public, anon, authenticated, service_role;
grant select, insert on public.erp_sales_orders, public.erp_sales_order_lines to service_role;

create function public.convert_erp_sales_proposal(p_tenant uuid, p_proposal uuid, p_actor uuid)
returns table (outcome text, order_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  proposal public.proposals%rowtype;
  existing_order uuid;
begin
  select * into proposal from public.proposals
    where tenant_id = p_tenant and id = p_proposal for share;
  if not found then return query select 'not_found'::text, null::uuid; return; end if;

  select o.id into existing_order from public.erp_sales_orders o
    where o.tenant_id = p_tenant and o.proposal_id = p_proposal;
  if found then return query select 'existing'::text, existing_order; return; end if;
  if proposal.status <> 'accepted' then return query select 'not_accepted'::text, null::uuid; return; end if;

  insert into public.erp_sales_orders (tenant_id,proposal_id,contact_id,title,currency,subtotal,discount,total,created_by)
    values (p_tenant,p_proposal,proposal.contact_id,proposal.title,proposal.currency,proposal.subtotal,coalesce((to_jsonb(proposal)->>'discount_value')::numeric,(to_jsonb(proposal)->>'discount')::numeric,0),proposal.total,p_actor)
    on conflict (tenant_id,proposal_id) do nothing returning id into existing_order;
  if not found then
    select o.id into existing_order from public.erp_sales_orders o
      where o.tenant_id = p_tenant and o.proposal_id = p_proposal;
    return query select 'existing'::text, existing_order; return;
  end if;

  insert into public.erp_sales_order_lines
    (tenant_id,order_id,source_item_id,product_id,description,quantity,unit_price,discount,total,sort_order)
    select p_tenant,existing_order,i.id,i.product_id,i.description,i.quantity,i.unit_price,
      greatest(0, round(i.quantity * i.unit_price, 2) - value.line_total),
      value.line_total,i.sort_order
    from public.proposal_items i
    cross join lateral (select coalesce((to_jsonb(i)->>'line_total')::numeric,(to_jsonb(i)->>'total')::numeric) as line_total) value
    where i.tenant_id = p_tenant and i.proposal_id = p_proposal;
  if not found then raise exception 'Proposta sem itens' using errcode = '22023'; end if;
  return query select 'created'::text, existing_order;
end;
$$;

revoke all on function public.convert_erp_sales_proposal(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.convert_erp_sales_proposal(uuid,uuid,uuid) to service_role;
