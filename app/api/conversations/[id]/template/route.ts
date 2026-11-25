import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { getWhatsAppProvider, sendWhatsAppTemplate } from '@/lib/server/whatsapp';
import { enqueueOutbound } from '@/lib/server/outbound-queue';
import { audit } from '@/lib/server/audit';

const schema = z.object({
  name: z.string().trim().min(1).max(512),
  language: z.string().trim().min(2).max(32).default('pt_BR'),
  components: z.array(z.unknown()).default([])
});

type TemplatePart = { type?: string; text?: string };
type TemplateParameter = { type?: string; text?: string };
type SendComponent = { type?: string; parameters?: TemplateParameter[] };

function approvedTemplateBody(definitions: unknown[], supplied: unknown[]): string | null {
  const components = definitions as TemplatePart[];
  const parameters = supplied as SendComponent[];
  const parts: string[] = [];
  for (const part of components) {
    if (!part || typeof part !== 'object') continue;
    const type = String(part.type ?? '').toUpperCase();
    if (!['HEADER', 'BODY', 'FOOTER'].includes(type) || typeof part.text !== 'string') continue;
    const values = parameters.find(component => component?.type?.toUpperCase() === type)?.parameters ?? [];
    let missingParameter = false;
    const rendered = part.text.replace(/{{\s*(\d+)\s*}}/g, (_match, index: string) => {
      const value = values[Number(index) - 1];
      if (!value || value.type !== 'text' || typeof value.text !== 'string') {
        missingParameter = true;
        return '';
      }
      return value.text;
    });
    if (missingParameter) return null;
    if (rendered.trim()) parts.push(rendered.trim());
  }
  return parts.length ? parts.join('\n') : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission('conversations.send');
    const { id } = await params;
    const input = schema.parse(await request.json());
    const supabase = await createClient();

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id,channel,assigned_to,status,contact:contacts(phone,consent_status)')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', id)
      .maybeSingle();

    if (conversationError) throw conversationError;
    if (!conversation) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (conversation.assigned_to !== ctx.userId) return NextResponse.json({ error: 'conversation_assigned_elsewhere' }, { status: 403 });
    if (conversation.status === 'closed') return NextResponse.json({ error: 'conversation_closed' }, { status: 409 });
    if (conversation.channel !== 'whatsapp') return NextResponse.json({ error: 'whatsapp_only' }, { status: 409 });
    if (await getWhatsAppProvider(ctx.tenantId) !== 'meta') {
      return NextResponse.json({ error: 'templates_require_meta_provider' }, { status: 409 });
    }

    const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
    if (contact?.consent_status === 'opt_out') {
      return NextResponse.json({ error: 'contact_opted_out' }, { status: 409 });
    }

    const { data: template, error: templateError } = await supabase
      .from('whatsapp_templates')
      .select('name,language,status,components')
      .eq('tenant_id', ctx.tenantId)
      .eq('name', input.name)
      .eq('language', input.language)
      .maybeSingle();
    if (templateError) throw templateError;
    if (!template || template.status?.toUpperCase() !== 'APPROVED') {
      return NextResponse.json({ error: 'template_not_approved_or_not_synced' }, { status: 409 });
    }
    const body = approvedTemplateBody(
      Array.isArray(template.components) ? template.components : [],
      input.components
    );
    if (!body) {
      return NextResponse.json({ error: 'template_body_or_parameters_unavailable' }, { status: 422 });
    }
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

    const sent = await sendWhatsAppTemplate(ctx.tenantId, contact?.phone, input.name, input.language, input.components);
    let delivery = 'queued';
    let queueId: string | null = null;

    if (sent.delivered) {
      delivery = 'sent';
      await supabase
        .from('messages')
        .update({ status: 'sent', provider_message_id: sent.providerMessageId ?? null })
        .eq('tenant_id', ctx.tenantId)
        .eq('id', message.id);
    } else {
      queueId = await enqueueOutbound({
        tenantId: ctx.tenantId,
        conversationId: id,
        messageId: message.id,
        channel: 'whatsapp',
        payload: {
          kind: 'template',
          to: contact?.phone ?? '',
          name: input.name,
          language: input.language,
          components: input.components
        },
        error: sent.reason ?? null
      });
    }

    const now = new Date().toISOString();
    await supabase
      .from('conversations')
      .update({ last_outbound_at: now, first_response_at: now, updated_at: now })
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
