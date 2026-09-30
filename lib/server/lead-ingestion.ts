import { createAdminClient } from '@/lib/supabase/admin';
import { emitWebhookEvent } from '@/lib/server/webhook-dispatch';

export type InboundChannel = 'internal' | 'whatsapp' | 'instagram' | 'facebook' | 'email' | 'external';

type Attribution = Record<string, unknown>;

type IngestLeadInput = {
  tenantId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  attribution?: Attribution | null;
  channel?: InboundChannel;
  externalId?: string | null;
  externalName?: string | null;
  message?: string | null;
  providerMessageId?: string | null;
  messageType?: 'text' | 'image' | 'audio' | 'file' | 'system';
  attachment?: {
    path?: string | null;
    name?: string | null;
    mime?: string | null;
    size?: number | null;
  } | null;
  createConversation?: boolean;
};

function clean(value?: string | null) {
  const v = value?.trim();
  return v || null;
}

function normalizePhone(value?: string | null) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return `+${digits}`;
}

function genericName(channel: InboundChannel, externalId?: string | null) {
  if (channel === 'whatsapp') return externalId ? `WhatsApp ${externalId.slice(-4)}` : 'Contato WhatsApp';
  if (channel === 'instagram') return 'Contato Instagram';
  if (channel === 'facebook') return 'Contato Facebook';
  return 'Novo contato';
}

function leadScore(input: {
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  channel: InboundChannel;
  message?: string | null;
  attribution?: Attribution | null;
}) {
  let score = 10;
  if (input.phone) score += 20;
  if (input.email) score += 15;
  if (input.message?.trim()) score += 15;
  if (['whatsapp','instagram','facebook'].includes(input.channel)) score += 15;
  if (/meta|google|ads/i.test(input.source ?? '')) score += 10;
  const attribution = input.attribution ?? {};
  if (attribution.utm_campaign || attribution.gclid || attribution.fbclid) score += 10;
  return Math.min(100, score);
}

function leadTemperature(score: number) {
  return score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
}

async function nextAssignee(admin: ReturnType<typeof createAdminClient>, tenantId: string) {
  const { data, error } = await admin.rpc('next_lead_assignee', { p_tenant_id: tenantId });
  if (error) return null;
  return typeof data === 'string' ? data : null;
}

async function findContactByIdentity(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  channel: InboundChannel,
  externalId?: string | null
) {
  if (!externalId || channel === 'internal') return null;
  const { data } = await admin
    .from('contact_channels')
    .select('contact_id')
    .eq('tenant_id', tenantId)
    .eq('channel', channel === 'external' ? 'external' : channel)
    .eq('external_id', externalId)
    .limit(1)
    .maybeSingle();
  return data?.contact_id ?? null;
}

async function findContactByPhoneOrEmail(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  phone?: string | null,
  email?: string | null
) {
  if (phone) {
    const { data } = await admin
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone', phone)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (email) {
    const { data } = await admin
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('email', email)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  return null;
}

export async function ingestLead(input: IngestLeadInput) {
  const admin = createAdminClient();
  const channel = input.channel ?? 'internal';
  const phone = normalizePhone(input.phone);
  const email = clean(input.email)?.toLowerCase() ?? null;
  const externalId = clean(input.externalId);
  const name = clean(input.name) ?? clean(input.externalName) ?? genericName(channel, externalId);
  const source = clean(input.source) ?? (
    channel === 'whatsapp' ? 'WhatsApp' :
    channel === 'instagram' ? 'Instagram' :
    channel === 'facebook' ? 'Facebook' :
    channel === 'email' ? 'E-mail' :
    channel === 'external' ? 'Integração externa' : 'CRM'
  );

  let contactId = await findContactByIdentity(admin, input.tenantId, channel, externalId);
  if (!contactId) contactId = await findContactByPhoneOrEmail(admin, input.tenantId, phone, email);

  let ownerId: string | null = null;
  const computedScore = leadScore({ phone, email, source, channel, message: input.message, attribution: input.attribution });
  const computedTemperature = leadTemperature(computedScore);
  let isNewContact = false;

  if (contactId) {
    const { data: current, error: currentError } = await admin
      .from('contacts')
      .select('id,name,email,phone,source,attribution,owner_id,lead_score')
      .eq('tenant_id', input.tenantId)
      .eq('id', contactId)
      .single();
    if (currentError) throw currentError;

    ownerId = current.owner_id ?? null;
    if (!ownerId) ownerId = await nextAssignee(admin, input.tenantId);

    const mergedAttribution = {
      ...(current.attribution && typeof current.attribution === 'object' ? current.attribution : {}),
      ...(input.attribution ?? {})
    };

    const { error: updateError } = await admin
      .from('contacts')
      .update({
        name: name || current.name,
        email: email ?? current.email,
        phone: phone ?? current.phone,
        source: current.source || source,
        attribution: mergedAttribution,
        owner_id: ownerId,
        lead_score: Math.max(Number(current.lead_score ?? 0), computedScore),
        lead_temperature: leadTemperature(Math.max(Number(current.lead_score ?? 0), computedScore)),
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', input.tenantId)
      .eq('id', contactId);
    if (updateError) throw updateError;
  } else {
    isNewContact = true;
    ownerId = await nextAssignee(admin, input.tenantId);
    const { data: created, error: createError } = await admin
      .from('contacts')
      .insert({
        tenant_id: input.tenantId,
        name,
        email,
        phone,
        source,
        status: 'lead',
        attribution: input.attribution ?? {},
        owner_id: ownerId,
        lead_score: computedScore,
        lead_temperature: computedTemperature
      })
      .select('id')
      .single();
    if (createError) throw createError;
    contactId = created.id;
  }

  if (externalId && channel !== 'internal') {
    const identityChannel = channel === 'external' ? 'external' : channel;
    const { error: identityError } = await admin
      .from('contact_channels')
      .upsert({
        tenant_id: input.tenantId,
        contact_id: contactId,
        channel: identityChannel,
        external_id: externalId,
        display_name: clean(input.externalName) ?? name,
        metadata: { source }
      }, { onConflict: 'tenant_id,channel,external_id' });
    if (identityError) throw identityError;
  }

  const shouldCreateConversation = input.createConversation ?? Boolean(input.message || channel !== 'internal');
  let conversationId: string | null = null;

  if (shouldCreateConversation) {
    const crmChannel = channel === 'external' ? 'internal' : channel;
    const { data: openConversation } = await admin
      .from('conversations')
      .select('id,assigned_to,attendance_state')
      .eq('tenant_id', input.tenantId)
      .eq('contact_id', contactId)
      .eq('channel', crmChannel)
      .neq('status', 'closed')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openConversation?.id) {
      conversationId = openConversation.id;
      if (!openConversation.assigned_to && ownerId) {
        await admin
          .from('conversations')
          .update({
            assigned_to: ownerId,
            attendance_state: 'in_service',
            attendance_changed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('tenant_id', input.tenantId)
          .eq('id', conversationId);
      }
    } else {
      const { data: createdConversation, error: conversationError } = await admin
        .from('conversations')
        .insert({
          tenant_id: input.tenantId,
          contact_id: contactId,
          channel: crmChannel,
          status: 'open',
          assigned_to: ownerId,
          attendance_state: ownerId ? 'in_service' : 'waiting',
          attendance_changed_at: new Date().toISOString()
        })
        .select('id')
        .single();
      if (conversationError) throw conversationError;
      conversationId = createdConversation.id;
    }
  }

  if (conversationId && input.providerMessageId) {
    const { data: existing } = await admin
      .from('messages')
      .select('id')
      .eq('tenant_id', input.tenantId)
      .eq('provider_message_id', input.providerMessageId)
      .limit(1)
      .maybeSingle();

    if (!existing?.id) {
      const type = input.messageType ?? 'text';
      const body = clean(input.message) ?? (
        type === 'audio' ? 'Mensagem de voz' :
        type === 'image' ? 'Imagem recebida' :
        type === 'file' ? input.attachment?.name ?? 'Arquivo recebido' : ''
      );

      const { error: messageError } = await admin.from('messages').insert({
        tenant_id: input.tenantId,
        conversation_id: conversationId,
        direction: 'inbound',
        body,
        status: 'received',
        provider_message_id: input.providerMessageId,
        message_type: type,
        attachment_path: input.attachment?.path ?? null,
        attachment_name: input.attachment?.name ?? null,
        attachment_mime: input.attachment?.mime ?? null,
        attachment_size: input.attachment?.size ?? null
      });
      if (messageError) throw messageError;
    }
  } else if (conversationId && clean(input.message)) {
    const { error: messageError } = await admin.from('messages').insert({
      tenant_id: input.tenantId,
      conversation_id: conversationId,
      direction: 'inbound',
      body: clean(input.message),
      status: 'received',
      message_type: input.messageType ?? 'text'
    });
    if (messageError) throw messageError;
  }

  if (conversationId) {
    const now = new Date().toISOString();
    await admin
      .from('conversations')
      .update({
        updated_at: now,
        ...(input.message || input.providerMessageId ? { last_inbound_at: now } : {})
      })
      .eq('tenant_id', input.tenantId)
      .eq('id', conversationId);
  }

  if (isNewContact) {
    await admin
      .from('notifications')
      .insert({
        tenant_id: input.tenantId,
        user_id: ownerId,
        type: 'lead_created',
        title: 'Novo lead recebido',
        body: `${name} entrou por ${source}.`,
        entity_type: 'contact',
        entity_id: contactId,
        priority: computedTemperature === 'hot' ? 'high' : 'normal'
      });
    await emitWebhookEvent(input.tenantId,'lead.created',contactId,{contact_id:contactId,name,email,phone,source,owner_id:ownerId,lead_score:computedScore,lead_temperature:computedTemperature});
  }

  if (conversationId && (input.message || input.providerMessageId)) {
    await emitWebhookEvent(input.tenantId,'message.received',conversationId,{conversation_id:conversationId,contact_id:contactId,channel,body:clean(input.message),message_type:input.messageType??'text',provider_message_id:input.providerMessageId??null});
  }

  const { data: contact } = await admin
    .from('contacts')
    .select('id,name,email,phone,source,status,owner_id,attribution,lead_score,lead_temperature,created_at')
    .eq('tenant_id', input.tenantId)
    .eq('id', contactId)
    .single();

  return { contact, conversationId, assignedTo: ownerId };
}
