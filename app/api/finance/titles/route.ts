import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';

const fields = 'id,direction,description,due_date,amount_cents,settled_cents';
const cents = z.number().int().positive().max(99_999_999_999);
const titleSchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(['payable', 'receivable']),
  description: z.string().trim().min(2).max(160),
  due_date: z.string().date(),
  amount_cents: cents
});
const settlementSchema = z.object({
  id: z.string().uuid(),
  title_id: z.string().uuid(),
  amount_cents: cents
});

function failure(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }
  return NextResponse.json({ error: 'Não foi possível concluir a operação financeira.' }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const { tenantId } = await requirePermission('finance.view');
    const page = z.coerce.number().int().min(0).max(10_000).parse(new URL(request.url).searchParams.get('page') ?? 0);
    const { data, error } = await createAdminClient().from('finance_titles').select(fields)
      .eq('tenant_id', tenantId).order('due_date').order('id').range(page * 50, page * 50 + 50);
    if (error) throw error;
    return NextResponse.json({ data: data.slice(0, 50), hasMore: data.length > 50 }, {
      headers: { 'cache-control': 'private, no-store' }
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { tenantId, userId } = await requirePermission('finance.manage');
    const input = titleSchema.parse(await request.json());
    const admin = createAdminClient();
    const { error } = await admin.from('finance_titles').upsert({
      ...input, tenant_id: tenantId, created_by: userId
    }, { onConflict: 'tenant_id,id', ignoreDuplicates: true });
    if (error) throw error;
    const { data, error: readError } = await admin.from('finance_titles').select(fields)
      .eq('tenant_id', tenantId).eq('id', input.id).single();
    if (readError) throw readError;
    if (data.direction !== input.direction || data.description !== input.description ||
        data.due_date !== input.due_date || data.amount_cents !== input.amount_cents) {
      return NextResponse.json({ error: 'Identificador já utilizado com outros dados.' }, { status: 409 });
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { tenantId, userId } = await requirePermission('finance.manage');
    const input = settlementSchema.parse(await request.json());
    const { data, error } = await createAdminClient().rpc('record_finance_settlement', {
      p_tenant: tenantId, p_title: input.title_id, p_operation: input.id,
      p_amount: input.amount_cents, p_actor: userId
    });
    if (error) throw error;
    if (data === 'not_found') return NextResponse.json({ error: 'Título não encontrado.' }, { status: 404 });
    if (data !== 'ok') return NextResponse.json({ error: 'Baixa duplicada com valor diferente ou superior ao saldo.' }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
