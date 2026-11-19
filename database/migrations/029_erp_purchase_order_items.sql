create function public.create_erp_purchase_order_items(
  p_tenant uuid, p_order uuid, p_supplier uuid, p_items jsonb, p_actor uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item_count integer;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then return 'invalid_items'; end if;
  item_count := jsonb_array_length(p_items);
  if item_count not between 1 and 50 then return 'invalid_items'; end if;
  if exists (select 1 from jsonb_to_recordset(p_items)
    as i(product_id uuid, quantity_milli bigint, unit_price_cents bigint)
    where i.product_id is null or i.quantity_milli is null or i.unit_price_cents is null
      or i.quantity_milli not between 1 and 999999999999
      or i.unit_price_cents not between 1 and 99999999999)
    or (select count(distinct i.product_id) from jsonb_to_recordset(p_items)
      as i(product_id uuid)) <> item_count then return 'invalid_items';
  end if;

  insert into public.erp_purchase_orders (tenant_id, id, supplier_id, created_by)
    select p_tenant, p_order, p_supplier, p_actor
    where exists (select 1 from public.erp_suppliers
      where tenant_id = p_tenant and id = p_supplier and active)
    and not exists (
      select 1 from jsonb_to_recordset(p_items) as i(product_id uuid)
      where not exists (select 1 from public.products p
        where p.tenant_id = p_tenant and p.id = i.product_id and p.active)
    )
    on conflict (tenant_id, id) do nothing;

  if not found then
    if not exists (select 1 from public.erp_purchase_orders
      where tenant_id = p_tenant and id = p_order) then return 'not_found'; end if;
    if exists (select 1 from public.erp_purchase_orders
        where tenant_id = p_tenant and id = p_order and supplier_id = p_supplier)
      and (select count(*) from public.erp_purchase_order_lines
        where tenant_id = p_tenant and order_id = p_order) = item_count
      and not exists (
        select 1 from jsonb_to_recordset(p_items)
          as i(product_id uuid, quantity_milli bigint, unit_price_cents bigint)
        where not exists (select 1 from public.erp_purchase_order_lines l
          where l.tenant_id = p_tenant and l.order_id = p_order and l.product_id = i.product_id
          and l.quantity_milli = i.quantity_milli and l.unit_price_cents = i.unit_price_cents)
      ) then return 'ok';
    end if;
    return 'conflict';
  end if;

  insert into public.erp_purchase_order_lines
    (tenant_id, order_id, product_id, quantity_milli, unit_price_cents)
    select p_tenant, p_order, i.product_id, i.quantity_milli, i.unit_price_cents
    from jsonb_to_recordset(p_items)
      as i(product_id uuid, quantity_milli bigint, unit_price_cents bigint);
  return 'ok';
end;
$$;

revoke all on function public.create_erp_purchase_order_items(uuid,uuid,uuid,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.create_erp_purchase_order_items(uuid,uuid,uuid,jsonb,uuid) to service_role;
