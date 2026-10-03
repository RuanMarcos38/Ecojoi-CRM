import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { enqueueOutbound } from '@/lib/server/outbound-queue';
import { audit } from '@/lib/server/audit';
import { canSendHumanMessage } from '@/lib/crm/concurrency';
import { requireFeature } from '@/lib/server/feature';

const schema = z.object({
  name: z.string().trim().min(1).max(512),
  language: z.string().trim().min(2).max(32).default('pt_BR'),
  components: z.array(z.unknown()).default([])
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission('conversations.send');
    await requireFeature(ctx,'atendimento');
    const { id } = await params;
    const input = schema.parse(await request.json());
    const supabase = await createClient();

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id,status,assigned_to,attendance_state,channel,contact:contacts(phone,consent_status)')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', id)
      .maybeSingle();

    if (conversationError) throw conversationError;
    if (!conversation) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!canSendHumanMessage({userId:ctx.userId,assignedTo:conversation.assigned_to,state:conversation.attendance_state,status:conversation.status})) return NextResponse.json({error:'conversation_not_assigned_to_you'},{status:409});
    if (conversation.channel !== 'whatsapp') return NextResponse.json({ error: 'whatsapp_only' }, { status: 409 });

    const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
    if (contact?.consent_status === 'opt_out') {
      return NextResponse.json({ error: 'contact_opted_out' }, { status: 409 });
    }

    const body = `Template WhatsApp: ${input.name}`;
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        tenant_id: ctx.tenantId,
        conversation_id: id,
        direction: 'outbound',
        body,
        sender_user_id: ctx.userId,
        status: 'queued',
        message_type: 'text'
      })
      .select()
      .single();
    if (messageError) throw messageError;

    const delivery='queued';
    const queueId=await enqueueOutbound({
      tenantId:ctx.tenantId,conversationId:id,messageId:message.id,channel:'whatsapp',
      payload:{kind:'template',to:contact?.phone??'',name:input.name,language:input.language,components:input.components,actor:'human',actorUserId:ctx.userId}
    });

    const now = new Date().toISOString();
    await supabase
      .from('conversations')
      .update({ updated_at: now })
      .eq('tenant_id', ctx.tenantId)
      .eq('id', id);

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'whatsapp.template.send',
      entity: 'conversation',
      entityId: id,
      metadata: { template: input.name, language: input.language, delivery, queue_id: queueId }
    });

    return NextResponse.json({ data: { message, delivery, queue_id: queueId } }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'whatsapp_template_send_failed' }, { status: 500 });
  }
}
