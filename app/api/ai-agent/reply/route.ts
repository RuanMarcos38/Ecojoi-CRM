import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { isWhatsAppWindowOpen, sendWhatsAppText } from '@/lib/server/meta';
import { enqueueOutbound } from '@/lib/server/outbound-queue';

const usageSchema=z.object({
  provider:z.string().trim().max(80).optional().default('external'),
  model:z.string().trim().max(160).optional().nullable(),
  input_tokens:z.coerce.number().int().min(0).optional().default(0),
  output_tokens:z.coerce.number().int().min(0).optional().default(0),
  estimated_cost:z.coerce.number().min(0).optional().default(0),
  request_id:z.string().trim().max(240).optional().nullable(),
  metadata:z.record(z.unknown()).optional().default({})
});

const schema = z.object({
  tenant_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
  summary: z.string().trim().max(8000).optional().nullable(),
  next_action: z.string().trim().max(2000).optional().nullable(),
  usage: usageSchema.optional()
});

export async function POST(req: Request) {
  try {
    const expected = process.env.N8N_WEBHOOK_TOKEN?.trim() || process.env.AI_AGENT_WEBHOOK_TOKEN?.trim();
    if (!expected) return NextResponse.json({ error: 'ai_agent_not_configured' }, { status: 503 });

    const authorization = req.headers.get('authorization') ?? '';
    if (authorization !== 'Bearer ' + expected) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const input = schema.parse(await req.json());
    const supabase = createAdminClient();

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id,channel,attendance_state,last_inbound_at,first_response_at,contact:contacts(phone)')
      .eq('id', input.conversation_id)
      .eq('tenant_id', input.tenant_id)
      .maybeSingle();

    if (conversationError) throw conversationError;
    if (!conversation) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (conversation.attendance_state !== 'automatic') {
      return NextResponse.json({ error: 'conversation_not_in_automatic_mode' }, { status: 409 });
    }
    if (conversation.channel === 'whatsapp' && !isWhatsAppWindowOpen(conversation.last_inbound_at)) {
      return NextResponse.json({ error: 'whatsapp_window_closed', template_required: true }, { status: 409 });
    }

    const initialStatus = conversation.channel === 'internal' ? 'sent' : 'queued';
    const { data, error } = await supabase
      .from('messages')
      .insert({
        tenant_id: input.tenant_id,
        conversation_id: input.conversation_id,
        direction: 'outbound',
        body: input.body,
        status: initialStatus,
        message_type: 'text'
      })
      .select()
      .single();
    if (error) throw error;

    let delivery = initialStatus;
    let providerMessageId: string | null = null;
    let queueId: string | null = null;

    if (conversation.channel === 'whatsapp') {
      const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
      const sent = await sendWhatsAppText(input.tenant_id, contact?.phone, input.body);
      if (sent.delivered) {
        delivery = 'sent';
        providerMessageId = sent.providerMessageId ?? null;
        await supabase
          .from('messages')
          .update({ status: delivery, provider_message_id: providerMessageId })
          .eq('tenant_id', input.tenant_id)
          .eq('id', data.id);
      } else {
        queueId = await enqueueOutbound({
          tenantId: input.tenant_id,
          conversationId: input.conversation_id,
          messageId: data.id,
          channel: 'whatsapp',
          payload: { kind: 'text', to: contact?.phone ?? '', body: input.body },
          error: sent.reason ?? null
        });
      }
    }

    const now = new Date().toISOString();
    const conversationPatch:Record<string,unknown>={
      updated_at: now,
      last_outbound_at: now,
      first_response_at: conversation.first_response_at ?? now
    };
    if(input.summary!==undefined){
      conversationPatch.ai_summary=input.summary||null;
      conversationPatch.ai_summary_updated_at=now;
    }
    if(input.next_action!==undefined){
      conversationPatch.ai_next_action=input.next_action||null;
      conversationPatch.ai_summary_updated_at=now;
    }

    await supabase.from('conversations')
      .update(conversationPatch)
      .eq('id', input.conversation_id)
      .eq('tenant_id', input.tenant_id);

    if(input.usage){
      const totalTokens=Number(input.usage.input_tokens??0)+Number(input.usage.output_tokens??0);
      await supabase.from('ai_usage_logs').insert({
        tenant_id:input.tenant_id,
        conversation_id:input.conversation_id,
        provider:input.usage.provider||'external',
        model:input.usage.model??null,
        input_tokens:Number(input.usage.input_tokens??0),
        output_tokens:Number(input.usage.output_tokens??0),
        total_tokens:totalTokens,
        estimated_cost:Number(input.usage.estimated_cost??0),
        request_id:input.usage.request_id??null,
        metadata:input.usage.metadata??{}
      });
    }

    return NextResponse.json({
      data: { ...data, status: delivery, provider_message_id: providerMessageId },
      delivery,
      queue_id: queueId
    }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'ai_agent_reply_failed' }, { status: 500 });
  }
}
