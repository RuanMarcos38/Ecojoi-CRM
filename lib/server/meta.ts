import { createHmac, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestLead } from '@/lib/server/lead-ingestion';
import { notifyAiAgentMessage } from '@/lib/server/ai-agent';

const BUCKET = 'ecojoi-message-attachments';

function graphVersion() {
  return process.env.META_GRAPH_API_VERSION?.trim() || 'v23.0';
}

function accessToken() {
  return process.env.META_GRAPH_ACCESS_TOKEN?.trim() || '';
}

function graphUrl(path: string) {
  const clean = path.replace(/^\//, '');
  return `https://graph.facebook.com/${graphVersion()}/${clean}`;
}

function digits(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '');
}

export function metaRuntimeConfigured() {
  return Boolean(
    accessToken() &&
    process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() &&
    process.env.META_APP_SECRET?.trim()
  );
}

export function verifyMetaSignature(rawBody: string, signature: string | null) {
  const secret = process.env.META_APP_SECRET?.trim();
  if (!secret || !signature?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function graphRequest(path: string, init?: RequestInit) {
  const token = accessToken();
  if (!token) throw new Error('META_GRAPH_ACCESS_TOKEN is not configured.');
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const response = await fetch(graphUrl(path), { ...init, headers, cache: 'no-store' });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.error?.message || `Meta Graph API ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function tenantByAsset(
  column: 'meta_phone_number_id' | 'meta_page_id' | 'meta_instagram_account_id',
  id?: string | null
) {
  if (!id) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenant_settings')
    .select('tenant_id')
    .eq(column, id)
    .limit(1)
    .maybeSingle();
  return data?.tenant_id ?? null;
}

async function claimEvent(tenantId: string, eventKey: string, eventType: string, metadata: Record<string, unknown> = {}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('integration_events')
    .insert({
      tenant_id: tenantId,
      provider: 'meta',
      event_key: eventKey,
      event_type: eventType,
      payload_meta: metadata
    })
    .select('id')
    .maybeSingle();

  if (!error && data?.id) return true;
  if ((error as any)?.code === '23505') return false;
  if (error) throw error;
  return false;
}

export async function getTenantMetaStatus(tenantId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenant_settings')
    .select('meta_business_id,meta_waba_id,meta_phone_number_id,meta_page_id,meta_instagram_account_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  return {
    runtimeConfigured: metaRuntimeConfigured(),
    identifiersConfigured: Boolean(data?.meta_phone_number_id || data?.meta_page_id || data?.meta_instagram_account_id),
    settings: data ?? null
  };
}

async function phoneNumberIdForTenant(tenantId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenant_settings')
    .select('meta_phone_number_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data?.meta_phone_number_id?.trim() || null;
}

async function wabaIdForTenant(tenantId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenant_settings')
    .select('meta_waba_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data?.meta_waba_id?.trim() || null;
}

export function isWhatsAppWindowOpen(lastInboundAt?: string | null) {
  if (!lastInboundAt) return true;
  const ts = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts <= 24 * 60 * 60 * 1000;
}

export async function sendWhatsAppText(tenantId: string, to: string | null | undefined, body: string) {
  const phoneNumberId = await phoneNumberIdForTenant(tenantId);
  const recipient = digits(to);
  if (!phoneNumberId || !recipient || !accessToken()) return { delivered: false as const, reason: 'not_configured' };

  try {
    const data = await graphRequest(`${phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: { preview_url: true, body }
      })
    });
    return { delivered: true as const, providerMessageId: data?.messages?.[0]?.id ?? null };
  } catch (error) {
    return { delivered: false as const, reason: error instanceof Error ? error.message : 'meta_send_failed' };
  }
}

export async function sendWhatsAppMedia(
  tenantId: string,
  to: string | null | undefined,
  file: File,
  caption?: string | null
) {
  const phoneNumberId = await phoneNumberIdForTenant(tenantId);
  const recipient = digits(to);
  if (!phoneNumberId || !recipient || !accessToken()) return { delivered: false as const, reason: 'not_configured' };

  try {
    const upload = new FormData();
    upload.append('messaging_product', 'whatsapp');
    upload.append('file', file, file.name);
    const media = await graphRequest(`${phoneNumberId}/media`, { method: 'POST', body: upload });
    const mediaId = media?.id;
    if (!mediaId) throw new Error('Meta did not return a media id.');

    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'document';
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type
    };

    if (type === 'image') payload.image = { id: mediaId, ...(caption ? { caption } : {}) };
    if (type === 'audio') payload.audio = { id: mediaId };
    if (type === 'document') payload.document = { id: mediaId, filename: file.name, ...(caption ? { caption } : {}) };

    const sent = await graphRequest(`${phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return { delivered: true as const, providerMessageId: sent?.messages?.[0]?.id ?? null };
  } catch (error) {
    return { delivered: false as const, reason: error instanceof Error ? error.message : 'meta_media_send_failed' };
  }
}


export async function sendWhatsAppTemplate(
  tenantId: string,
  to: string | null | undefined,
  name: string,
  language = 'pt_BR',
  components: unknown[] = []
) {
  const phoneNumberId = await phoneNumberIdForTenant(tenantId);
  const recipient = digits(to);
  if (!phoneNumberId || !recipient || !accessToken()) return { delivered: false as const, reason: 'not_configured' };

  try {
    const data = await graphRequest(`${phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'template',
        template: {
          name,
          language: { code: language },
          ...(components.length ? { components } : {})
        }
      })
    });
    return { delivered: true as const, providerMessageId: data?.messages?.[0]?.id ?? null };
  } catch (error) {
    return { delivered: false as const, reason: error instanceof Error ? error.message : 'meta_template_send_failed' };
  }
}

export async function syncWhatsAppTemplates(tenantId: string) {
  const wabaId = await wabaIdForTenant(tenantId);
  if (!wabaId || !accessToken()) return { configured: false, count: 0 };

  const data = await graphRequest(`${wabaId}/message_templates?limit=250&fields=id,name,language,category,status,components`);
  const templates = Array.isArray(data?.data) ? data.data : [];
  const admin = createAdminClient();

  for (const template of templates) {
    const { error } = await admin
      .from('whatsapp_templates')
      .upsert({
        tenant_id: tenantId,
        meta_template_id: template.id ? String(template.id) : null,
        name: String(template.name ?? ''),
        language: String(template.language ?? 'pt_BR'),
        category: template.category ? String(template.category) : null,
        status: template.status ? String(template.status) : null,
        components: Array.isArray(template.components) ? template.components : [],
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,name,language' });
    if (error) throw error;
  }

  return { configured: true, count: templates.length };
}

async function downloadMetaMedia(mediaId: string) {
  const metadata = await graphRequest(mediaId);
  if (!metadata?.url) throw new Error('Meta media URL not found.');

  const response = await fetch(metadata.url, {
    headers: { Authorization: `Bearer ${accessToken()}` },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Meta media download ${response.status}`);

  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    bytes,
    mime: response.headers.get('content-type') || metadata.mime_type || 'application/octet-stream'
  };
}

async function saveInboundMedia(tenantId: string, conversationId: string, mediaId: string, fileName: string) {
  const admin = createAdminClient();
  const media = await downloadMetaMedia(mediaId);
  const safe = fileName.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'arquivo';
  const path = `${tenantId}/${conversationId}/meta-${crypto.randomUUID()}-${safe}`;

  const { error } = await admin.storage.from(BUCKET).upload(path, media.bytes, {
    contentType: media.mime,
    upsert: false
  });
  if (error) throw error;

  return { path, mime: media.mime, size: media.bytes.byteLength };
}

function whatsappText(message: any) {
  if (message?.type === 'text') return message.text?.body ?? '';
  if (message?.type === 'button') return message.button?.text ?? '';
  if (message?.type === 'interactive') {
    return message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? '';
  }
  return '';
}

async function notifyAutomaticConversation(tenantId: string, conversationId?: string | null) {
  if (!conversationId) return;
  const admin = createAdminClient();
  const { data } = await admin
    .from('conversations')
    .select('id,channel,attendance_state,contact:contacts(id,name,email,phone),messages(id,direction,body,message_type,created_at)')
    .eq('tenant_id', tenantId)
    .eq('id', conversationId)
    .maybeSingle();

  if (!data || data.attendance_state !== 'automatic') return;
  const recentMessages = [...(data.messages ?? [])]
    .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(-30);

  await notifyAiAgentMessage({
    tenantId,
    conversationId,
    channel: data.channel,
    contact: data.contact,
    messages: recentMessages
  });
}

async function processWhatsAppValue(value: any) {
  const phoneNumberId = value?.metadata?.phone_number_id;
  const tenantId = await tenantByAsset('meta_phone_number_id', phoneNumberId);
  if (!tenantId) return;

  const admin = createAdminClient();

  for (const status of value?.statuses ?? []) {
    if (!status?.id) continue;
    await admin
      .from('messages')
      .update({ status: status.status ?? 'sent' })
      .eq('tenant_id', tenantId)
      .eq('provider_message_id', status.id);
  }

  for (const message of value?.messages ?? []) {
    if (!message?.id || !message?.from) continue;
    const fresh = await claimEvent(tenantId, message.id, 'whatsapp_message', { phone_number_id: phoneNumberId });
    if (!fresh) continue;

    const waContact = (value?.contacts ?? []).find((item: any) => item?.wa_id === message.from);
    const displayName = waContact?.profile?.name ?? null;
    const type = message.type === 'image' ? 'image' : message.type === 'audio' ? 'audio' : message.type === 'document' ? 'file' : 'text';

    const base = await ingestLead({
      tenantId,
      channel: 'whatsapp',
      externalId: message.from,
      externalName: displayName,
      name: displayName,
      phone: message.from,
      source: 'WhatsApp',
      attribution: { meta_phone_number_id: phoneNumberId },
      createConversation: true
    });

    let attachment: { path?: string | null; name?: string | null; mime?: string | null; size?: number | null } | undefined;
    let body = whatsappText(message);

    const mediaNode = type === 'image' ? message.image : type === 'audio' ? message.audio : type === 'file' ? message.document : null;
    if (mediaNode?.id && base.conversationId) {
      const defaultName = type === 'image' ? 'imagem-whatsapp' : type === 'audio' ? 'audio-whatsapp' : mediaNode.filename || 'documento-whatsapp';
      try {
        const stored = await saveInboundMedia(tenantId, base.conversationId, mediaNode.id, defaultName);
        attachment = { ...stored, name: mediaNode.filename || defaultName };
        body = body || mediaNode.caption || (type === 'audio' ? 'Mensagem de voz' : type === 'image' ? 'Imagem recebida' : attachment.name || 'Arquivo recebido');
      } catch {
        body = body || (type === 'audio' ? 'Mensagem de voz recebida' : 'Mídia recebida pelo WhatsApp');
      }
    }

    const received = await ingestLead({
      tenantId,
      channel: 'whatsapp',
      externalId: message.from,
      externalName: displayName,
      name: displayName,
      phone: message.from,
      source: 'WhatsApp',
      message: body,
      providerMessageId: message.id,
      messageType: type,
      attachment,
      createConversation: true
    });

    await notifyAutomaticConversation(tenantId, received.conversationId);
  }
}

function fieldsToObject(fieldData: any[]) {
  const out: Record<string, string> = {};
  for (const field of fieldData ?? []) {
    const value = Array.isArray(field?.values) ? field.values[0] : null;
    if (field?.name && value != null) out[String(field.name).toLowerCase()] = String(value);
  }
  return out;
}

async function processLeadgen(pageId: string, leadgenId: string, raw: any) {
  const tenantId = await tenantByAsset('meta_page_id', pageId);
  if (!tenantId) return;

  const fresh = await claimEvent(tenantId, leadgenId, 'meta_leadgen', { page_id: pageId });
  if (!fresh) return;

  const data = await graphRequest(`${leadgenId}?fields=created_time,field_data,form_id,ad_id,adset_id,campaign_id,platform`);
  const fields = fieldsToObject(data?.field_data ?? []);
  const first = fields.first_name || '';
  const last = fields.last_name || '';
  const name = fields.full_name || fields.name || `${first} ${last}`.trim() || 'Lead Meta';

  await ingestLead({
    tenantId,
    name,
    email: fields.email || null,
    phone: fields.phone_number || fields.phone || null,
    source: 'Meta Lead Ads',
    channel: 'facebook',
    externalId: `leadgen:${leadgenId}`,
    externalName: name,
    attribution: {
      meta_leadgen_id: leadgenId,
      meta_form_id: data?.form_id ?? raw?.form_id ?? null,
      meta_ad_id: data?.ad_id ?? raw?.ad_id ?? null,
      meta_adset_id: data?.adset_id ?? raw?.adset_id ?? null,
      meta_campaign_id: data?.campaign_id ?? raw?.campaign_id ?? null,
      platform: data?.platform ?? null
    },
    createConversation: true
  });
}

async function fetchMetaPersonName(id: string) {
  try {
    const person = await graphRequest(`${id}?fields=name,first_name,last_name`);
    return person?.name || `${person?.first_name ?? ''} ${person?.last_name ?? ''}`.trim() || null;
  } catch {
    return null;
  }
}

async function processMessagingEntry(object: string, entry: any) {
  const isInstagram = object === 'instagram';
  const assetId = entry?.id;
  const tenantId = await tenantByAsset(isInstagram ? 'meta_instagram_account_id' : 'meta_page_id', assetId);
  if (!tenantId) return;

  for (const event of entry?.messaging ?? []) {
    const providerId = event?.message?.mid;
    const senderId = event?.sender?.id;
    if (!providerId || !senderId) continue;
    const fresh = await claimEvent(tenantId, providerId, isInstagram ? 'instagram_message' : 'facebook_message', { asset_id: assetId });
    if (!fresh) continue;

    const name = await fetchMetaPersonName(senderId);
    const received = await ingestLead({
      tenantId,
      name,
      source: isInstagram ? 'Instagram' : 'Facebook',
      channel: isInstagram ? 'instagram' : 'facebook',
      externalId: senderId,
      externalName: name,
      message: event?.message?.text || 'Nova mensagem recebida',
      providerMessageId: providerId,
      messageType: 'text',
      createConversation: true
    });

    await notifyAutomaticConversation(tenantId, received.conversationId);
  }
}

export async function processMetaWebhook(payload: any) {
  const object = String(payload?.object ?? '');

  if (object === 'whatsapp_business_account') {
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        if (change?.field === 'messages') await processWhatsAppValue(change.value);
      }
    }
    return;
  }

  if (object === 'page') {
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        if (change?.field === 'leadgen' && change?.value?.leadgen_id) {
          await processLeadgen(String(entry.id), String(change.value.leadgen_id), change.value);
        }
      }
      await processMessagingEntry(object, entry);
    }
    return;
  }

  if (object === 'instagram') {
    for (const entry of payload?.entry ?? []) await processMessagingEntry(object, entry);
  }
}
