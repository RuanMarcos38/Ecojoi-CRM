import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';

const id = z.string().uuid();
const quantity = z.number().int().min(1).max(999_999_999_999);
const actions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('supplier'), id, legal_name: z.string().trim().min(2).max(160), tax_document: z.string().regex(/^(?:\d{11}|\d{14})$/).nullable() }),
  z.object({ action: z.literal('order'), id, supplier_id: id, product_id: id, quantity_milli: quantity, unit_price_cents: z.number().int().min(1).max(99_999_999_999) }),
  z.object({ action: z.literal('approve'), order_id: id }),
  z.object({ action: z.literal('receive'), id, order_id: id, line_id: id, quantity_milli: quantity, due_date: z.string().date() })
]);

function failure(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  return NextResponse.json({ error: 'Não foi possível concluir a operação de compras.' }, { status: 500 });
}

export async function GET() {
  try {
    const { tenantId } = await requirePermission('erp.purchases.view');
    const admin = createAdminClient();
    const [suppliers, orders] = await Promise.all([
      admin.from('erp_suppliers').select('id,legal_name,tax_document').eq('tenant_id', tenantId).eq('active', true).order('legal_name'),
      admin.from('erp_purchase_orders').select('id,supplier_id,status,created_at,lines:erp_purchase_order_lines(id,product_id,quantity_milli,received_milli,unit_price_cents)')
        .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100)
    ]);
    if (suppliers.error || orders.error) throw suppliers.error ?? orders.error;
    return NextResponse.json({ suppliers: suppliers.data, orders: orders.data }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { tenantId, userId } = await requirePermission('erp.purchases.manage');
    const input = actions.parse(await request.json());
    const admin = createAdminClient();

    if (input.action === 'supplier') {
      const { error } = await admin.from('erp_suppliers').upsert({
        id: input.id, legal_name: input.legal_name, tax_document: input.tax_document, tenant_id: tenantId
      }, { onConflict: 'tenant_id,id', ignoreDuplicates: true });
      if (error?.code === '23505') return NextResponse.json({ error: 'Documento já cadastrado.' }, { status: 409 });
      if (error) throw error;
    } else if (input.action === 'approve') {
      const { data, error } = await admin.from('erp_purchase_orders').update({ status: 'approved' })
        .eq('tenant_id', tenantId).eq('id', input.order_id).eq('status', 'draft').select('id').maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'Apenas pedidos em rascunho podem ser aprovados.' }, { status: 409 });
    } else {
      const result = input.action === 'order'
        ? await admin.rpc('create_erp_purchase_order', {
          p_tenant: tenantId, p_order: input.id, p_supplier: input.supplier_id, p_product: input.product_id,
          p_quantity: input.quantity_milli, p_price: input.unit_price_cents, p_actor: userId
        })
        : await admin.rpc('receive_erp_purchase_line', {
          p_tenant: tenantId, p_order: input.order_id, p_line: input.line_id, p_operation: input.id,
          p_quantity: input.quantity_milli, p_due_date: input.due_date, p_actor: userId
        });
      if (result.error) throw result.error;
      if (result.data === 'not_found') return NextResponse.json({ error: 'Fornecedor, produto ou pedido indisponível.' }, { status: 404 });
      if (result.data !== 'ok') return NextResponse.json({ error: 'Operação já utilizada, pedido não aprovado ou quantidade acima do saldo.' }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
