import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';

function failure(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }
  return NextResponse.json({ error: 'Não foi possível acessar os pedidos de venda.' }, { status: 500 });
}

export async function GET() {
  try {
    const { tenantId } = await requirePermission('deals.view');
    const admin = createAdminClient();
    const [proposals, orders] = await Promise.all([
      admin.from('proposals').select('id,title,total').eq('tenant_id', tenantId).eq('status', 'accepted').order('created_at', { ascending: false }).limit(100),
      admin.from('erp_sales_orders').select('id,proposal_id,title,total,created_at,items:erp_sales_order_lines(description,quantity,unit_price,total,sort_order)')
        .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100)
    ]);
    if (proposals.error || orders.error) throw proposals.error ?? orders.error;
    return NextResponse.json({ proposals: proposals.data, orders: orders.data }, {
      headers: { 'cache-control': 'private, no-store' }
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { tenantId, userId } = await requirePermission('deals.update');
    const { proposal_id } = z.object({ proposal_id: z.string().uuid() }).parse(await request.json());
    const { data, error } = await createAdminClient().rpc('convert_erp_sales_proposal', {
      p_tenant: tenantId, p_proposal: proposal_id, p_actor: userId
    }).single();
    if (error?.code === '22023') return NextResponse.json({ error: 'A proposta precisa ter itens.' }, { status: 409 });
    if (error) throw error;
    const result = data as { outcome: string; order_id: string | null };
    if (result.outcome === 'not_found') return NextResponse.json({ error: 'Proposta não encontrada.' }, { status: 404 });
    if (!result.order_id) return NextResponse.json({ error: 'A proposta precisa estar aceita pelo cliente.' }, { status: 409 });
    return NextResponse.json({ id: result.order_id, created: result.outcome === 'created' }, { status: result.outcome === 'created' ? 201 : 200 });
  } catch (error) {
    return failure(error);
  }
}
