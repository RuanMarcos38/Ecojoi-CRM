import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { audit } from '@/lib/server/audit';

const patch = z.object({
  title: z.string().min(2).max(180).optional(),
  stage: z.enum(['new','qualification','proposal','closing','won','lost']).optional(),
  value: z.coerce.number().min(0).optional(),
  probability: z.coerce.number().int().min(0).max(100).optional()
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission('deals.update');
    const { id } = await params;
    const body = patch.parse(await req.json());
    const supabase = await createClient();
    const { data: current } = await supabase.from('deals').select('id,stage').eq('id', id).eq('tenant_id', ctx.tenantId).maybeSingle();
    if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const now = new Date().toISOString();
    const changes: Record<string, unknown> = { ...body, updated_at: now };
    if (body.stage && body.stage !== current.stage) changes.stage_changed_at = now;

    const { data, error } = await supabase.from('deals').update(changes).eq('id', id).eq('tenant_id', ctx.tenantId).select().maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'deal.update', entity: 'deal', entityId: id, metadata: { previous_stage: current.stage, stage: body.stage ?? current.stage } });
    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'deal_update_failed' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission('deals.delete');
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase.from('deals').delete().eq('id', id).eq('tenant_id', ctx.tenantId).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'deal.delete', entity: 'deal', entityId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'deal_delete_failed' }, { status: 500 });
  }
}
