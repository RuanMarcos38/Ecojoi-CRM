import { getAgentName, signAgentMessage } from '@/lib/server/agent-signature';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { audit } from '@/lib/server/audit';
import { canSendFreeformWhatsApp, getWhatsAppProvider, sendWhatsAppText } from '@/lib/server/whatsapp';
import { enqueueOutbound } from '@/lib/server/outbound-queue';

const schema = z.object({ body: z.string().min(1).max(4000), reply_to_message_id: z.string().uuid().optional(), request_id: z.string().uuid().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission('conversations.send');
    await requireFeature(ctx, 'atendimento');
    const { id } = await params;
    const body = schema.parse(await req.json());
    const supabase = await createClient();

    const { data: conversation } = await supabase
      .from('conversations')
      .select('id,channel,assigned_to,status,attendance_state,last_inbound_at,first_response_at,contact:contacts(phone)')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (!conversation) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (conversation.assigned_to !== ctx.userId) return NextResponse.json({ error: 'conversation_assigned_elsewhere' }, { status: 403 });
    if (conversation.status === 'closed') return NextResponse.json({ error: 'conversation_closed' }, { status: 409 });
    const previousRequest = async () => {
      if (!body.request_id) return null;
      const { data, error } = await supabase.from('messages').select('*')
        .eq('id', body.request_id).eq('tenant_id', ctx.tenantId)
        .eq('conversation_id', id).eq('sender_user_id', ctx.userId)
        .eq('direction', 'outbound').maybeSingle();
      if (error) throw error;
      return data ? NextResponse.json({ data, delivery: data.status }) : null;
    };
    const previous = await previousRequest();
    if (previous) return previous;

    if (conversation.attendance_state === 'automatic') {
      return NextResponse.json({ error: 'conversation_in_automatic_mode' }, { status: 409 });
    }
    if (conversation.attendance_state !== 'in_service') {
      return NextResponse.json({ error: 'conversation_not_in_human_service' }, { status: 409 });
    }
    if (conversation.channel === 'whatsapp' && !(await canSendFreeformWhatsApp(ctx.tenantId, conversation.last_inbound_at))) {
      return NextResponse.json({ error: 'whatsapp_window_closed', template_required: true }, { status: 409 });
    }

    let replyToProviderId: string | undefined;
    if (body.reply_to_message_id) {
      if (conversation.channel !== 'whatsapp') {
        return NextResponse.json({ error: 'whatsapp_reply_not_supported' }, { status: 409 });
      }
      const { data: target, error: targetError } = await supabase.from('messages')
        .select('provider_message_id')
        .eq('tenant_id', ctx.tenantId)
        .eq('conversation_id', id)
        .eq('id', body.reply_to_message_id)
        .maybeSingle();
      if (targetError) throw targetError;
      const provider = await getWhatsAppProvider(ctx.tenantId);
      if (!target?.provider_message_id || target.provider_message_id.startsWith('wamid.') !== (provider === 'meta')) {
        return NextResponse.json({ error: 'reply_target_unavailable' }, { status: 404 });
      }
      replyToProviderId = target.provider_message_id;
    }

    const outgoingBody = conversation.channel === 'whatsapp'
      ? signAgentMessage(await getAgentName(ctx.tenantId, ctx.userId), body.body) : body.body;

    const initialStatus = conversation.channel === 'internal' ? 'sent' : 'queued';
    const { data, error } = await supabase
      .from('messages')
      .insert({
        ...(body.request_id ? { id: body.request_id } : {}),
        tenant_id: ctx.tenantId,
        conversation_id: id,
        direction: 'outbound',
        body: outgoingBody,
        sender_user_id: ctx.userId,
        status: initialStatus,
        message_type: 'text',
        ...(replyToProviderId ? { reply_to_provider_id: replyToProviderId } : {})
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505' && body.request_id) {
        const concurrent = await previousRequest();
        if (concurrent) return concurrent;
      }
      throw error;
    }

    let delivery: 'sent' | 'queued' | 'failed' = initialStatus;
    let providerMessageId: string | null = null;
    let queueId: string | null = null;

    if (conversation.channel === 'whatsapp') {
      const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
      const sent = replyToProviderId
        ? await sendWhatsAppText(ctx.tenantId, contact?.phone, outgoingBody, replyToProviderId)
        : await sendWhatsAppText(ctx.tenantId, contact?.phone, outgoingBody);
      if (sent.delivered) {
        delivery = 'sent';
        providerMessageId = sent.providerMessageId ?? null;
        await supabase
          .from('messages')
          .update({ status: delivery, provider_message_id: providerMessageId })
          .eq('tenant_id', ctx.tenantId)
          .eq('id', data.id);
      } else if (sent.reason === 'delivery_unconfirmed') {
        delivery = 'failed';
        await supabase.from('messages').update({ status: delivery }).eq('tenant_id', ctx.tenantId).eq('id', data.id);
      } else {
        queueId = await enqueueOutbound({
          tenantId: ctx.tenantId,
          conversationId: id,
          messageId: data.id,
          channel: 'whatsapp',
          payload: { kind: 'text', to: contact?.phone ?? '', body: outgoingBody, ...(replyToProviderId ? { replyToProviderId } : {}) },
          error: sent.reason ?? null
        });
      }
    }

    const now = new Date().toISOString();
    await supabase
      .from('conversations')
      .update({
        updated_at: now,
        last_outbound_at: now,
        first_response_at: conversation.first_response_at ?? now
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
