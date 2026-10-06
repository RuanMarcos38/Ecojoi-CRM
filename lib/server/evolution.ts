import { createAdminClient } from '@/lib/supabase/admin';
import { ingestLead } from '@/lib/server/lead-ingestion';
import { notifyAiAgentMessage } from '@/lib/server/ai-agent';

const BUCKET = 'ecojoi-message-attachments';

function baseUrl() {
  return (process.env.EVOLUTION_API_URL?.trim() || '').replace(/\/$/, '');
}

function apiKey() {
  return process.env.EVOLUTION_API_KEY?.trim() || '';
}

function webhookToken() {
  return process.env.EVOLUTION_WEBHOOK_TOKEN?.trim() || '';
}

function digits(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '');
}

export function evolutionRuntimeConfigured() {
  return Boolean(baseUrl() && apiKey() && webhookToken());
}

async function evolutionRequest(path: string, init?: RequestInit) {
  if (!baseUrl() || !apiKey()) throw new Error('Evolution API is not configured.');
  const headers = new Headers(init?.headers);
  headers.set('apikey', apiKey());
  if (init?.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${baseUrl()}/${path.replace(/^\//, '')}`, {
    ...init,
    headers,
    cache: 'no-store'
  });

  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw || null; }

  if (!response.ok) {
    const message = data?.response?.message?.[0]
      || data?.response?.message
      || data?.message
      || data?.error
      || `Evolution API ${response.status}`;
    throw new Error(Array.isArray(message) ? String(message[0]) : String(message));
  }

  return data;
}

async function tenantEvolutionSettings(tenantId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenant_settings')
    .select('evolution_instance_name,whatsapp_provider')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  return {
    instanceName: data?.evolution_instance_name?.trim() || null,
    provider: data?.whatsapp_provider === 'evolution' ? 'evolution' as const : 'meta' as const
  };
}

async function tenantByInstance(instanceName?: string | null) {
  if (!instanceName) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenant_settings')
    .select('tenant_id,whatsapp_provider')
    .eq('evolution_instance_name', instanceName)
    .limit(1)
    .maybeSingle();

  return data?.whatsapp_provider === 'evolution' ? data.tenant_id : null;
}

function stateFrom(data: any) {
  return data?.instance?.state
    || data?.instance?.status
    || data?.state
    || data?.status
    || null;
}

function qrImageFrom(data: any) {
  const candidates = [
    data?.base64,
    data?.qrcode?.base64,
    data?.qrcode?.code,
    data?.qrcode,
    data?.data?.base64,
    data?.data?.qrcode
  ].filter((value: unknown): value is string => typeof value === 'string' && value.length > 0);

  for (const value of candidates) {
    if (value.startsWith('data:image/')) return value;
    const compact = value.replace(/\s/g, '');
    if (compact.length > 200 && /^[A-Za-z0-9+/=]+$/.test(compact)) {
      return `data:image/png;base64,${compact}`;
    }
  }
  return null;
}

export async function getTenantEvolutionStatus(tenantId: string) {
  const settings = await tenantEvolutionSettings(tenantId);
  const configured = evolutionRuntimeConfigured() && Boolean(settings.instanceName);

  if (!configured) {
    return {
      ok: false,
      runtimeConfigured: evolutionRuntimeConfigured(),
      instanceConfigured: Boolean(settings.instanceName),
      instanceName: settings.instanceName,
      state: 'not_configured' as const
    };
  }

  try {
    const data = await evolutionRequest(`instance/connectionState/${encodeURIComponent(settings.instanceName!)}`);
    const state = String(stateFrom(data) || 'unknown').toLowerCase();
    return {
      ok: state === 'open' || state === 'connected',
      runtimeConfigured: true,
      instanceConfigured: true,
      instanceName: settings.instanceName,
      state
    };
  } catch (error) {
    return {
      ok: false,
      runtimeConfigured: true,
      instanceConfigured: true,
      instanceName: settings.instanceName,
      state: 'error' as const,
      error: error instanceof Error ? error.message : 'evolution_status_failed'
    };
  }
}

function webhookUrl(publicBaseUrl: string) {
  const url = new URL('/api/integrations/evolution/webhook', publicBaseUrl);
  url.searchParams.set('token', webhookToken());
  return url.toString();
}

async function ensureInstance(instanceName: string) {
  let exists = false;
  try {
    const found = await evolutionRequest(`instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);
    const rows = Array.isArray(found) ? found : Array.isArray(found?.data) ? found.data : [];
    exists = rows.some((row: any) =>
      row?.name === instanceName
      || row?.instanceName === instanceName
      || row?.instance?.instanceName === instanceName
    );
  } catch {
    exists = false;
  }

  if (exists) return null;

  try {
    return await evolutionRequest('instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('already') || message.includes('exist') || message.includes('instance name')) return null;
    throw error;
  }
}

export async function connectEvolution(tenantId: string, publicBaseUrl: string) {
  const settings = await tenantEvolutionSettings(tenantId);
  if (!evolutionRuntimeConfigured()) throw new Error('Evolution API server configuration is incomplete.');
  if (!settings.instanceName) throw new Error('Evolution instance name is not configured for this tenant.');

  const created = await ensureInstance(settings.instanceName);

  await evolutionRequest(`webhook/set/${encodeURIComponent(settings.instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({
      enabled: true,
      url: webhookUrl(publicBaseUrl),
      webhookByEvents: false,
      webhookBase64: true,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE']
    })
  });

  const connected = await evolutionRequest(`instance/connect/${encodeURIComponent(settings.instanceName)}`);
  const qr = qrImageFrom(connected) || qrImageFrom(created);
  const state = String(stateFrom(connected) || (qr ? 'connecting' : 'unknown')).toLowerCase();

  return {
    instanceName: settings.instanceName,
    state,
    connected: state === 'open' || state === 'connected',
    qr,
    pairingCode: connected?.pairingCode || connected?.qrcode?.pairingCode || null
  };
}

async function sendTextOnce(instanceName: string, recipient: string, body: string, legacy = false) {
  const payload = legacy
    ? { number: recipient, text: body, textMessage: { text: body } }
    : { number: recipient, text: body };

  return evolutionRequest(`message/sendText/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function sendEvolutionText(tenantId: string, to: string | null | undefined, body: string) {
  const settings = await tenantEvolutionSettings(tenantId);
  const recipient = digits(to);
  if (!settings.instanceName || !recipient || !evolutionRuntimeConfigured()) {
    return { delivered: false as const, reason: 'not_configured' };
  }

  try {
    let data: any;
    try {
      data = await sendTextOnce(settings.instanceName, recipient, body);
    } catch {
      data = await sendTextOnce(settings.instanceName, recipient, body, true);
    }

    return {
      delivered: true as const,
      providerMessageId: data?.key?.id ?? data?.message?.key?.id ?? data?.id ?? null
    };
  } catch (error) {
    return { delivered: false as const, reason: error instanceof Error ? error.message : 'evolution_send_failed' };
  }
}

export async function sendEvolutionMedia(
  tenantId: string,
  to: string | null | undefined,
  file: File,
  caption?: string | null
) {
  const settings = await tenantEvolutionSettings(tenantId);
  const recipient = digits(to);
  if (!settings.instanceName || !recipient || !evolutionRuntimeConfigured()) {
    return { delivered: false as const, reason: 'not_configured' };
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const media = `data:${file.type || 'application/octet-stream'};base64,${base64}`;

    const data = file.type.startsWith('audio/')
      ? await evolutionRequest(`message/sendWhatsAppAudio/${encodeURIComponent(settings.instanceName)}`, {
          method: 'POST',
          body: JSON.stringify({ number: recipient, audio: media })
        })
      : await evolutionRequest(`message/sendMedia/${encodeURIComponent(settings.instanceName)}`, {
          method: 'POST',
          body: JSON.stringify({
            number: recipient,
            mediatype: file.type.startsWith('image/') ? 'image' : 'document',
            mimetype: file.type || 'application/octet-stream',
            caption: caption || '',
            media,
            fileName: file.name
          })
        });

    return {
      delivered: true as const,
      providerMessageId: data?.key?.id ?? data?.message?.key?.id ?? data?.id ?? null
    };
  } catch (error) {
    return { delivered: false as const, reason: error instanceof Error ? error.message : 'evolution_media_send_failed' };
  }
}

async function claimEvent(tenantId: string, eventKey: string, eventType: string, metadata: Record<string, unknown> = {}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('integration_events')
    .insert({
      tenant_id: tenantId,
      provider: 'evolution',
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

function textFromMessage(message: any) {
  return message?.conversation
    || message?.extendedTextMessage?.text
    || message?.imageMessage?.caption
    || message?.videoMessage?.caption
    || message?.documentMessage?.caption
    || '';
}

function inboundType(message: any) {
  if (message?.imageMessage) return 'image';
  if (message?.audioMessage) return 'audio';
  if (message?.documentMessage || message?.videoMessage) return 'file';
  return 'text';
}

function mediaNode(message: any, type: string) {
  if (type === 'image') return message?.imageMessage;
  if (type === 'audio') return message?.audioMessage;
  if (type === 'file') return message?.documentMessage || message?.videoMessage;
  return null;
}

async function saveInboundBase64(
  tenantId: string,
  conversationId: string,
  base64Value: string,
  mime: string,
  fileName: string
) {
  const clean = base64Value.includes(',') ? base64Value.split(',').pop() || '' : base64Value;
  const bytes = new Uint8Array(Buffer.from(clean, 'base64'));
  const safe = fileName.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'arquivo';
  const path = `${tenantId}/${conversationId}/evolution-${crypto.randomUUID()}-${safe}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime || 'application/octet-stream',
    upsert: false
  });
  if (error) throw error;
  return { path, mime, size: bytes.byteLength, name: fileName };
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

async function processInboundMessage(instanceName: string, data: any) {
  const tenantId = await tenantByInstance(instanceName);
  if (!tenantId) return;

  const key = data?.key ?? data?.data?.key;
  const message = data?.message ?? data?.data?.message;
  const remoteJid = String(key?.remoteJid ?? '');
  if (!key?.id || key?.fromMe || !remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return;

  const phone = digits(remoteJid.split('@')[0]);
  if (!phone) return;

  const fresh = await claimEvent(tenantId, String(key.id), 'whatsapp_message', { instance: instanceName });
  if (!fresh) return;

  const displayName = data?.pushName || data?.data?.pushName || null;
  const type = inboundType(message);
  const base = await ingestLead({
    tenantId,
    channel: 'whatsapp',
    externalId: phone,
    externalName: displayName,
    name: displayName,
    phone,
    source: 'WhatsApp',
    attribution: { evolution_instance_name: instanceName },
    createConversation: true
  });

  const node = mediaNode(message, type);
  let attachment: { path?: string | null; name?: string | null; mime?: string | null; size?: number | null } | undefined;
  let body = textFromMessage(message);
  const base64Value = data?.base64 || data?.data?.base64 || message?.base64 || null;

  if (base64Value && node && base.conversationId) {
    const mime = String(node?.mimetype || 'application/octet-stream');
    const fileName = String(node?.fileName || (type === 'image' ? 'imagem-whatsapp' : type === 'audio' ? 'audio-whatsapp' : 'arquivo-whatsapp'));
    try {
      attachment = await saveInboundBase64(tenantId, base.conversationId, String(base64Value), mime, fileName);
    } catch {
      attachment = undefined;
    }
  }

  if (!body) {
    body = type === 'audio' ? 'Mensagem de voz' : type === 'image' ? 'Imagem recebida' : type === 'file' ? 'Arquivo recebido' : 'Nova mensagem recebida';
  }

  const received = await ingestLead({
    tenantId,
    channel: 'whatsapp',
    externalId: phone,
    externalName: displayName,
    name: displayName,
    phone,
    source: 'WhatsApp',
    message: body,
    providerMessageId: String(key.id),
    messageType: type,
    attachment,
    createConversation: true
  });

  await notifyAutomaticConversation(tenantId, received.conversationId);
}

async function processMessageUpdate(instanceName: string, data: any) {
  const tenantId = await tenantByInstance(instanceName);
  if (!tenantId) return;
  const updates = Array.isArray(data) ? data : [data];

  for (const item of updates) {
    const id = item?.key?.id || item?.data?.key?.id;
    const status = item?.update?.status || item?.status || item?.data?.status;
    if (!id || status == null) continue;
    const normalized = String(status).toLowerCase();
    const mapped = normalized.includes('read') ? 'read'
      : normalized.includes('delivery') || normalized.includes('delivered') ? 'delivered'
      : normalized.includes('sent') || normalized === '2' || normalized === 'pending' ? 'sent'
      : normalized.includes('error') || normalized.includes('fail') ? 'failed'
      : 'sent';

    const admin = createAdminClient();
    await admin
      .from('messages')
      .update({ status: mapped })
      .eq('tenant_id', tenantId)
      .eq('provider_message_id', String(id));
  }
}

export async function processEvolutionWebhook(payload: any) {
  const instanceName = String(payload?.instance || payload?.instanceName || payload?.data?.instance || '');
  if (!instanceName) return;

  const event = String(payload?.event || '').toLowerCase().replace(/_/g, '.');

  if (event === 'messages.upsert' || event === 'messages.upserted') {
    const data = payload?.data;
    if (Array.isArray(data)) {
      for (const item of data) await processInboundMessage(instanceName, item);
    } else {
      await processInboundMessage(instanceName, data);
    }
    return;
  }

  if (event === 'messages.update') {
    await processMessageUpdate(instanceName, payload?.data);
  }
}
