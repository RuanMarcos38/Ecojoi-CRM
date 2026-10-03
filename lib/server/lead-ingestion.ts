import { createAdminClient } from '@/lib/supabase/admin';
import { phoneKey } from '@/lib/crm/phone';

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
  return phoneKey(value);
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

export async function ingestLead(input: IngestLeadInput) {
  const admin = createAdminClient();
  const channel = input.channel ?? 'internal';
  const phone = normalizePhone(input.phone);
  if (input.phone?.trim() && !phone) throw new Response('Phone invalid or incomplete; manual review required', {status:400});
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


  const computedScore=leadScore({phone,email,source,channel,message:input.message,attribution:input.attribution});
  const computedTemperature=leadTemperature(computedScore);
  const {data:identity,error:identityError}=await admin.rpc('crm_resolve_lead_identity',{
    p_tenant_id:input.tenantId,p_channel:channel,p_external_id:externalId,
    p_name:clean(input.name)??clean(input.externalName),p_fallback_name:name,p_email:email,p_phone:phone,p_source:source,
    p_attribution:input.attribution??{},p_score:computedScore
  });
  if(identityError){
    if(identityError.message?.includes('lead_identity_manual_review'))throw new Response('Contact identity ambiguous; manual review required',{status:409});
    throw identityError;
  }
  const contactId=identity.contact_id as string,ownerId=identity.owner_id as string|null,isNewContact=identity.is_new as boolean;
  let conversationId:string|null=null,newInbound=false;
  if(input.createConversation??Boolean(input.message||channel!=='internal')){
    const {data:id,error:conversationError}=await admin.rpc('crm_get_or_create_inbound_conversation',{
      p_tenant_id:input.tenantId,p_contact_id:contactId,p_channel:channel==='external'?'internal':channel,p_owner_id:ownerId
    });
    if(conversationError)throw conversationError;conversationId=id;
  }

  if (conversationId && input.providerMessageId) {
    const { data: existing, error:existingError } = await admin
      .from('messages')
      .select('id')
      .eq('tenant_id', input.tenantId)
      .eq('provider_message_id', input.providerMessageId)
      .limit(1)
      .maybeSingle();

    if(existingError)throw existingError;
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
      if(messageError&&messageError.code!=='23505')throw messageError;
      newInbound=!messageError;
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
    newInbound=true;
  }

  if (conversationId) {
    const now = new Date().toISOString();
    const {error:stateError}=await admin
      .from('conversations')
      .update({
        updated_at: now,
        ...(newInbound ? { last_inbound_at: now } : {})
      })
      .eq('tenant_id', input.tenantId)
      .eq('id', conversationId);
    if(stateError)throw stateError;
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
  }

  const { data: contact,error:contactError } = await admin
    .from('contacts')
    .select('id,name,email,phone,source,status,owner_id,attribution,lead_score,lead_temperature,created_at')
    .eq('tenant_id', input.tenantId)
    .eq('id', contactId)
    .single();

  if(contactError)throw contactError;
  return { contact, conversationId, assignedTo: ownerId };
}
