import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { audit } from '@/lib/server/audit';
import { sendWhatsAppText } from '@/lib/server/meta';

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
      .select('id,channel,attendance_state,contact:contacts(phone)')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (!conversation) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (conversation.attendance_state === 'automatic') {
      return NextResponse.json({ error: 'conversation_in_automatic_mode' }, { status: 409 });
    }
    if (conversation.attendance_state !== 'in_service') {
      return NextResponse.json({ error: 'conversation_not_in_human_service' }, { status: 409 });
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

    if (conversation.channel === 'whatsapp') {
      const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
      const sent = await sendWhatsAppText(ctx.tenantId, contact?.phone, body.body);
      if (sent.delivered) {
        delivery = 'sent';
        providerMessageId = sent.providerMessageId ?? null;
        await supabase
          .from('messages')
          .update({ status: delivery, provider_message_id: providerMessageId })
          .eq('tenant_id', ctx.tenantId)
          .eq('id', data.id);
      }
    }

    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId);

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'message.send',
      entity: 'conversation',
      entityId: id,
      metadata: { channel: conversation.channel, status: delivery }
    });

    return NextResponse.json({
      data: { ...data, status: delivery, provider_message_id: providerMessageId },
      delivery
    }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'message_send_failed' }, { status: 500 });
  }
}
