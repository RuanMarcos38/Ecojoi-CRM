import { hasAttendanceCapacity } from '@/lib/server/attendance-capacity';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { audit } from '@/lib/server/audit';
import { notifyAiAgent } from '@/lib/server/ai-agent';

import { canSendFreeformWhatsApp, sendWhatsAppText } from '@/lib/server/whatsapp';

const schema = z.object({
  state: z.enum(['waiting', 'in_service', 'automatic'])
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission('conversations.manage');
    await requireFeature(ctx, 'atendimento');
    const { id } = await params;
    const { state } = schema.parse(await req.json());
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    const supabase = createAdminClient();

    const { data: current, error: currentError } = await supabase
      .from('conversations')
      .select('id,status,assigned_to,attendance_state,channel,last_inbound_at,contact:contacts(id,name,email,phone),messages(id,direction,body,message_type,created_at)')
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

    const update = supabase
      .from('conversations')
      .update(patch)
      .neq('status', 'closed')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .eq('attendance_state', current.attendance_state);
    if (current.assigned_to) update.eq('assigned_to', current.assigned_to);
    else update.is('assigned_to', null);
    const { data, error } = await update
      .select('id,status,channel,assigned_to,attendance_state,attendance_changed_at,updated_at').maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'conversation_changed' }, { status: 409 });

    let greeting = 'not_applicable';
    if (current.attendance_state === 'waiting' && state === 'in_service' && current.channel === 'whatsapp') {
      greeting = 'failed';
      try {
        const contact = Array.isArray(current.contact) ? current.contact[0] : current.contact;
        if (!(await canSendFreeformWhatsApp(ctx.tenantId, current.last_inbound_at))) greeting = 'window_closed';
        else if (contact?.phone) {
          const { data: profile, error: profileError } = await supabase.from('profiles')
            .select('full_name').eq('tenant_id', ctx.tenantId).eq('id', ctx.userId).single();
          if (profileError) throw profileError;
          const attendant = profile.full_name?.trim();
          if (!attendant) throw new Error('attendant_name_unavailable');
          const customer = contact.name?.trim();
          const body = `Olá${customer ? `, ${customer}` : ''}! Aqui é ${attendant}, da Ecojoi. Vou dar continuidade ao seu atendimento. 😊`;
          const { data: message, error: insertError } = await supabase.from('messages').insert({
            tenant_id: ctx.tenantId, conversation_id: id, direction: 'outbound', body,
            sender_user_id: ctx.userId, status: 'queued', message_type: 'text'
          }).select('id').single();
          if (insertError) throw insertError;
          let providerMessageId: string | null = null;
          try {
            const result = await sendWhatsAppText(ctx.tenantId, contact.phone, body);
            if (result.delivered && result.providerMessageId) {
              greeting = 'sent';
              providerMessageId = result.providerMessageId;
            }
          } finally {
            await supabase.from('messages')
              .update({ status: greeting === 'sent' ? 'sent' : 'failed', provider_message_id: providerMessageId })
              .eq('tenant_id', ctx.tenantId).eq('id', message.id);
          }
        }
      } catch {
        greeting = 'failed';
      }
    }

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'conversation.attendance_state',
      entity: 'conversation',
      entityId: id,
      metadata: { from: current.attendance_state, to: state, greeting }
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

    return NextResponse.json({ data, greeting });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'attendance_state_update_failed' }, { status: 500 });
  }
}
