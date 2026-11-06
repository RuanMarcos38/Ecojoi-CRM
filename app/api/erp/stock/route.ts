import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';

const id = z.string().uuid();
const movement = z.object({
  product_id: id,
  id,
  delta_milli: z.number().int().min(-999_999_999_999).max(999_999_999_999).refine(value => value !== 0),
  reason: z.string().trim().min(2).max(160)
});

function failure(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: 'Dados de estoque inválidos.' }, { status: 400 });
  }
  return NextResponse.json({ error: 'Não foi possível acessar o estoque.' }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const { tenantId } = await requirePermission('erp.stock.view');
    const productId = id.parse(new URL(request.url).searchParams.get('product_id'));
    const admin = createAdminClient();
    const { data: product, error: productError } = await admin.from('products').select('id')
      .eq('tenant_id', tenantId).eq('id', productId).maybeSingle();
    if (productError) throw productError;
    if (!product) return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 });

    const { data, error } = await admin.from('erp_stock_movements')
      .select('id,delta_milli,balance_milli,reason,created_at')
      .eq('tenant_id', tenantId).eq('product_id', productId)
      .order('sequence_id', { ascending: false }).limit(50);
    if (error) throw error;
    return NextResponse.json({ data, balance_milli: data[0]?.balance_milli ?? 0 }, {
      headers: { 'cache-control': 'private, no-store' }
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { tenantId, userId } = await requirePermission('erp.stock.manage');
    const input = movement.parse(await request.json());
    const { data, error } = await createAdminClient().rpc('record_erp_stock_movement', {
      p_tenant: tenantId, p_product: input.product_id, p_operation: input.id,
      p_delta: input.delta_milli, p_reason: input.reason, p_actor: userId
    });
    if (error) throw error;
    if (data === 'not_found') return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 });
    if (data === 'conflict') return NextResponse.json({ error: 'Operação já registrada com outros dados.' }, { status: 409 });
    if (data !== 'ok') return NextResponse.json({ error: 'Movimento excede o saldo ou o limite de estoque.' }, { status: 409 });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
