import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { audit } from '@/lib/server/audit';

const schema = z.object({
  state: z.enum(['waiting', 'in_service', 'automatic'])
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission('conversations.manage');
    await requireFeature(ctx, 'atendimento');
    const { id } = await params;
    const { state } = schema.parse(await req.json());
    const supabase = await createClient();

    const { data: current, error: currentError } = await supabase
      .from('conversations')
      .select('id,attendance_state')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const now = new Date().toISOString();
    const patch = {
      attendance_state: state,
      attendance_changed_at: now,
      updated_at: now,
      assigned_to: state === 'in_service' ? ctx.userId : null
    };

    const { data, error } = await supabase
      .from('conversations')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .select('id,status,channel,assigned_to,attendance_state,attendance_changed_at,updated_at')
      .single();

    if (error) throw error;

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'conversation.attendance_state',
      entity: 'conversation',
      entityId: id,
      metadata: { from: current.attendance_state, to: state }
    });

    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'attendance_state_update_failed' }, { status: 500 });
  }
}
