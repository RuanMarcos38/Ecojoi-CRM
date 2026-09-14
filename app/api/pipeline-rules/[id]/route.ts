import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { audit } from '@/lib/server/audit';

const patch = z.object({
  name: z.string().min(2).max(120).optional(),
  stage: z.enum(['new','qualification','proposal','closing','won','lost']).optional(),
  wait_minutes: z.coerce.number().int().min(1).max(525600).optional(),
  channel: z.enum(['internal','whatsapp','email']).optional(),
  message_template: z.string().min(1).max(4000).optional(),
  enabled: z.boolean().optional()
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission('automations.manage');
    const { id } = await params;
    const body = patch.parse(await req.json());
    const supabase = await createClient();
    const { data, error } = await supabase.from('pipeline_message_rules')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id).eq('tenant_id', ctx.tenantId).select().maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'pipeline.rule_update', entity: 'pipeline_rule', entityId: id, metadata: body });
    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'pipeline_rule_update_failed' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission('automations.manage');
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase.from('pipeline_message_rules')
      .delete().eq('id', id).eq('tenant_id', ctx.tenantId).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'pipeline.rule_delete', entity: 'pipeline_rule', entityId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'pipeline_rule_delete_failed' }, { status: 500 });
  }
}
