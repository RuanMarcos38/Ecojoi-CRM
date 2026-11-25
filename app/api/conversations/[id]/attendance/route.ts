import { hasAttendanceCapacity } from '@/lib/server/attendance-capacity';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { audit } from '@/lib/server/audit';
import { notifyAiAgent } from '@/lib/server/ai-agent';

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
      .select('id,status,assigned_to,attendance_state,channel,contact:contacts(id,name,email,phone),messages(id,direction,body,message_type,created_at)')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    if (current.assigned_to && current.assigned_to !== ctx.userId) return NextResponse.json({ error: 'conversation_assigned_elsewhere' }, { status: 403 });
    if (current.status === 'closed') return NextResponse.json({ error: 'conversation_closed' }, { status: 409 });
    if (state === 'in_service' && current.assigned_to !== ctx.userId && !(await hasAttendanceCapacity(ctx.tenantId, ctx.userId))) {
      return NextResponse.json({ error: 'attendance_capacity_reached' }, { status: 409 });
    }

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
      .or(`assigned_to.eq.${ctx.userId},assigned_to.is.null`)
      .neq('status', 'closed')
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

    const recentMessages = [...(current.messages ?? [])]
      .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))
      .slice(-30);

    await notifyAiAgent({
      tenantId: ctx.tenantId,
      conversationId: id,
      state,
      channel: current.channel,
      contact: current.contact,
      messages: recentMessages
    });

    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'attendance_state_update_failed' }, { status: 500 });
  }
}
