import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { audit } from '@/lib/server/audit';
import { notifyAiAgent } from '@/lib/server/ai-agent';
import { canChangeAttendance } from '@/lib/crm/concurrency';

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
      .select('id,status,assigned_to,updated_at,attendance_state,channel,contact:contacts(id,name,email,phone),messages(id,direction,body,message_type,created_at)')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!canChangeAttendance({ role: ctx.role, userId: ctx.userId, assignedTo: current.assigned_to, state: current.attendance_state, status: current.status })) {
      return NextResponse.json({ error: 'conversation_already_assigned_or_closed' }, { status: 409 });
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
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .eq('updated_at', current.updated_at)
      .select('id,status,channel,assigned_to,attendance_state,attendance_changed_at,updated_at')
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'conversation_changed_reload' }, { status: 409 });

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'conversation.attendance_state',
      entity: 'conversation',
      entityId: id,
      metadata: { from: current.attendance_state, to: state, previous_owner: current.assigned_to, owner: data.assigned_to }
    });

    const recentMessages = [...(current.messages ?? [])]
      .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))
      .slice(-30);

    const bridge=await notifyAiAgent({
      tenantId: ctx.tenantId,
      conversationId: id,
      state,
      channel: current.channel,
      contact: current.contact,
      messages: recentMessages
    });

    if(state==='automatic'&&!bridge.delivered){
      const {data:fallback,error:fallbackError}=await supabase.from('conversations')
       .select('id,status,channel,assigned_to,attendance_state,attendance_changed_at,updated_at')
       .eq('id',id).eq('tenant_id',ctx.tenantId).single();
      if(fallbackError)throw fallbackError;
      return NextResponse.json({data:fallback,notice:'ai_bridge_unavailable_handoff'});
    }
    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'attendance_state_update_failed' }, { status: 500 });
  }
}
