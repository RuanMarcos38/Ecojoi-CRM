import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { audit } from '@/lib/server/audit';
import { isWhatsAppWindowOpen } from '@/lib/server/meta';
import { enqueueOutbound } from '@/lib/server/outbound-queue';
import { canSendHumanMessage } from '@/lib/crm/concurrency';

const schema = z.object({ body: z.string().min(1).max(4000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission('conversations.send');
    await requireFeature(ctx, 'atendimento');
    const { id } = await params;
    const body = schema.parse(await req.json());
    const supabase = await createClient();

    const { data: conversation } = await supabase
      .from('conversations')
      .select('id,status,assigned_to,channel,attendance_state,last_inbound_at,first_response_at,contact:contacts(phone)')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (!conversation) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!canSendHumanMessage({userId:ctx.userId,assignedTo:conversation.assigned_to,state:conversation.attendance_state,status:conversation.status})) return NextResponse.json({error:'conversation_not_assigned_to_you'},{status:409});
    if (conversation.attendance_state === 'automatic') {
      return NextResponse.json({ error: 'conversation_in_automatic_mode' }, { status: 409 });
    }
    if (conversation.attendance_state !== 'in_service') {
      return NextResponse.json({ error: 'conversation_not_in_human_service' }, { status: 409 });
    }
    if (conversation.channel === 'whatsapp' && !isWhatsAppWindowOpen(conversation.last_inbound_at)) {
      return NextResponse.json({ error: 'whatsapp_window_closed', template_required: true }, { status: 409 });
    }

    const initialStatus = conversation.channel === 'internal' ? 'sent' : 'queued';
    const { data, error } = await supabase
      .from('messages')
      .insert({
        tenant_id: ctx.tenantId,
        conversation_id: id,
        direction: 'outbound',
        body: body.body,
        sender_user_id: ctx.userId,
        status: initialStatus,
        message_type: 'text'
      })
      .select()
      .single();

    if (error) throw error;

    let delivery = initialStatus;
    let providerMessageId: string | null = null;
    let queueId: string | null = null;

    if(conversation.channel==='whatsapp'){
      const contact=Array.isArray(conversation.contact)?conversation.contact[0]:conversation.contact;
      queueId=await enqueueOutbound({tenantId:ctx.tenantId,conversationId:id,messageId:data.id,channel:'whatsapp',payload:{kind:'text',to:contact?.phone??'',body:body.body,actor:'human',actorUserId:ctx.userId}});
    }

    const now = new Date().toISOString();
    await supabase
      .from('conversations')
      .update({
        updated_at: now,
        ...(delivery==='sent'?{last_outbound_at:now,first_response_at:conversation.first_response_at??now}:{})
      })
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId);

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'message.send',
      entity: 'conversation',
      entityId: id,
      metadata: { channel: conversation.channel, status: delivery, queue_id: queueId }
    });

    return NextResponse.json({
      data: { ...data, status: delivery, provider_message_id: providerMessageId },
      delivery,
      queue_id: queueId
    }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'message_send_failed' }, { status: 500 });
  }
}
