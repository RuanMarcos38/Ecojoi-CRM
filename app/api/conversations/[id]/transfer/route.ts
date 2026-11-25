import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/server/audit';

async function transferContext() {
  const ctx = await requirePermission('conversations.manage');
  if (!['company_admin', 'super_admin', 'manager'].includes(ctx.role)) {
    throw NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  await requireFeature(ctx, 'atendimento');
  return ctx;
}

export async function GET() {
  try {
    const ctx = await transferContext();
    const { data, error } = await createAdminClient().from('profiles')
      .select('id,full_name').eq('tenant_id', ctx.tenantId).eq('active', true)
      .is('deleted_at', null).order('full_name');
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'assignees_fetch_failed' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await transferContext();
    const { id } = await params;
    const parsed = z.object({ assignee_id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
    if (!parsed.success || !z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }
    const db = createAdminClient();
    const [member, current] = await Promise.all([
      db.from('profiles').select('id,full_name').eq('tenant_id', ctx.tenantId)
        .eq('id', parsed.data.assignee_id).eq('active', true).is('deleted_at', null).maybeSingle(),
      db.from('conversations').select('assigned_to,attendance_state').eq('tenant_id', ctx.tenantId)
        .eq('id', id).neq('status', 'closed').maybeSingle()
    ]);
    if (member.error || current.error) throw member.error ?? current.error;
    if (!member.data || !current.data) return NextResponse.json({ error: 'transfer_target_unavailable' }, { status: 404 });

    if (current.data.assigned_to && current.data.assigned_to !== ctx.userId) return NextResponse.json({ error: 'conversation_assigned_elsewhere' }, { status: 403 });
    const now = new Date().toISOString();
    let query = db.from('conversations').update({
      assigned_to: member.data.id, attendance_state: 'in_service', attendance_changed_at: now, updated_at: now
    }).eq('tenant_id', ctx.tenantId).eq('id', id).neq('status', 'closed')
      .eq('attendance_state', current.data.attendance_state);
    query = current.data.assigned_to ? query.eq('assigned_to', current.data.assigned_to) : query.is('assigned_to', null);
    const { data, error } = await query.select('id,assigned_to,attendance_state').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'conversation_changed' }, { status: 409 });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'conversation.transfer', entity: 'conversation',
      entityId: id, metadata: { from: current.data.assigned_to, to: member.data.id } });
    return NextResponse.json({ data: { ...data, assignee: member.data } });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'transfer_failed' }, { status: 500 });
  }
}
