import { parseAttendanceRating } from '@/lib/server/attendance-survey';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { metaAdPreview } from '@/lib/server/meta-attribution';
import { ingestLead } from '@/lib/server/lead-ingestion';
import { notifyAiAgentMessage } from '@/lib/server/ai-agent';

const BUCKET = 'ecojoi-message-attachments';
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENT_BASE64_LENGTH = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4;

type EvolutionRuntime = {
  baseUrl: string;
  apiKey: string;
  webhookToken: string;
  source: 'database' | 'environment';
};

function cleanBaseUrl(value?: string | null) {
  return String(value ?? '').trim().replace(/\/$/, '');
}

function derivedWebhookToken(apiKey: string) {
  return createHash('sha256').update(`ecojoi-evolution-webhook:${apiKey}`).digest('hex');
}

function envRuntime(): EvolutionRuntime | null {
  const baseUrl = cleanBaseUrl(process.env.EVOLUTION_API_URL);
  const apiKey = process.env.EVOLUTION_API_KEY?.trim() || '';
  const webhookToken = process.env.EVOLUTION_WEBHOOK_TOKEN?.trim() || (apiKey ? derivedWebhookToken(apiKey) : '');
  return baseUrl && apiKey
    ? { baseUrl, apiKey, webhookToken, source: 'environment' }
    : null;
}

async function tenantRuntime(tenantId: string): Promise<EvolutionRuntime | null> {
  const admin = createAdminClient();
  try {
    const { data, error } = await admin
      .from('integration_secrets')
      .select('config')
      .eq('tenant_id', tenantId)
      .eq('provider', 'evolution')
      .maybeSingle();

    if (!error && data?.config) {
      const config = data.config as Record<string, unknown>;
      const baseUrl = cleanBaseUrl(String(config.api_url ?? ''));
      const apiKey = String(config.api_key ?? '').trim();
      const webhookToken = String(config.webhook_token ?? '').trim() || (apiKey ? derivedWebhookToken(apiKey) : '');
      if (baseUrl && apiKey) {
        return { baseUrl, apiKey, webhookToken, source: 'database' };
      }
    }
  } catch {
    // Environment fallback keeps existing deployments compatible.
  }

  return envRuntime();
}

function digits(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '');
}

export async function evolutionRuntimeConfigured(tenantId: string) {
  return Boolean(await tenantRuntime(tenantId));
}

async function evolutionRequest(runtime: EvolutionRuntime, path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('apikey', runtime.apiKey);
  if (init?.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${runtime.baseUrl}/${path.replace(/^\//, '')}`, {
    ...init,
    headers,
    redirect: 'error',
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
    throw Object.assign(new Error(Array.isArray(message) ? String(message[0]) : String(message)), { status: response.status });
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
    data?.data?.qrcode?.base64,
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
  const runtime = await tenantRuntime(tenantId);
  const configured = Boolean(runtime && settings.instanceName);

  if (!configured) {
    return {
      ok: false,
      runtimeConfigured: Boolean(runtime),
      instanceConfigured: Boolean(settings.instanceName),
      instanceName: settings.instanceName,
      state: 'not_configured' as const
    };
  }

  try {
    const data = await evolutionRequest(runtime!, `instance/connectionState/${encodeURIComponent(settings.instanceName!)}`);
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

function webhookUrl(publicBaseUrl: string, webhookToken: string) {
  const url = new URL('/api/integrations/evolution/webhook', publicBaseUrl);
  url.searchParams.set('token', webhookToken);
  return url.toString();
}

async function ensureInstance(runtime: EvolutionRuntime, instanceName: string) {
  try {
    await evolutionRequest(runtime, `instance/connectionState/${encodeURIComponent(instanceName)}`);
    return null;
  } catch {
    // Not available by direct state lookup; try manager listing next.
  }

  try {
    const found = await evolutionRequest(runtime, `instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);
    const rows = Array.isArray(found) ? found : Array.isArray(found?.data) ? found.data : [];
    const exists = rows.some((row: any) =>
      row?.name === instanceName
      || row?.instanceName === instanceName
      || row?.instance?.instanceName === instanceName
    );
    if (exists) return null;
  } catch {
    // Some Evolution deployments restrict the global instance listing.
  }

  try {
    return await evolutionRequest(runtime, 'instance/create', {
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

async function configureWebhook(runtime: EvolutionRuntime, instanceName: string, publicBaseUrl: string) {
  const webhook = {
    enabled: true,
    url: webhookUrl(publicBaseUrl, runtime.webhookToken),
    webhookByEvents: false,
    webhookBase64: true,
    events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE']
  };

  try {
    await evolutionRequest(runtime, `webhook/set/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      body: JSON.stringify(webhook)
    });
  } catch (firstError) {
    try {
      await evolutionRequest(runtime, `webhook/set/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        body: JSON.stringify({ webhook })
      });
    } catch {
      throw firstError;
    }
  }
}

export async function connectEvolution(tenantId: string, publicBaseUrl: string) {
  const settings = await tenantEvolutionSettings(tenantId);
  const runtime = await tenantRuntime(tenantId);
  if (!runtime) throw new Error('Evolution API server configuration is incomplete.');
  if (!settings.instanceName) throw new Error('Evolution instance name is not configured for this tenant.');

  const created = await ensureInstance(runtime, settings.instanceName);
  await configureWebhook(runtime, settings.instanceName, publicBaseUrl);

  let connected: any = null;
  try {
    connected = await evolutionRequest(runtime, `instance/connect/${encodeURIComponent(settings.instanceName)}`);
  } catch (error) {
    const status = await getTenantEvolutionStatus(tenantId);
    if (!status.ok) throw error;
  }

  const qr = qrImageFrom(connected) || qrImageFrom(created);
  const refreshed = await getTenantEvolutionStatus(tenantId);
  const state = refreshed.state === 'error'
    ? String(stateFrom(connected) || (qr ? 'connecting' : 'unknown')).toLowerCase()
    : refreshed.state;

  return {
    instanceName: settings.instanceName,
    state,
    connected: refreshed.ok || state === 'open' || state === 'connected',
    qr,
    pairingCode: connected?.pairingCode || connected?.qrcode?.pairingCode || created?.pairingCode || created?.qrcode?.pairingCode || null,
    qrCode: connected?.code || connected?.qrcode?.code || created?.code || created?.qrcode?.code || null
  };
}

async function sendTextOnce(
  runtime: EvolutionRuntime,
  instanceName: string,
  recipient: string,
  body: string,
  legacy = false,
  replyToProviderId?: string
) {
  const quoted = replyToProviderId ? { key: { id: replyToProviderId } } : undefined;
  const payload = legacy
    ? { number: recipient, text: body, textMessage: { text: body } }
    : { number: recipient, text: body, ...(quoted ? { quoted } : {}) };

  return evolutionRequest(runtime, `message/sendText/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function sendEvolutionText(tenantId: string, to: string | null | undefined, body: string, replyToProviderId?: string) {
  const settings = await tenantEvolutionSettings(tenantId);
  const runtime = await tenantRuntime(tenantId);
  const recipient = digits(to);
  if (!settings.instanceName || !recipient || !runtime) {
    return { delivered: false as const, reason: 'not_configured' };
  }

  try {
    let data: any;
    try {
      data = await sendTextOnce(runtime, settings.instanceName, recipient, body, false, replyToProviderId);
    } catch (error) {
      if (replyToProviderId || !(error instanceof Error && 'status' in error && error.status === 400)) throw error;
      data = await sendTextOnce(runtime, settings.instanceName, recipient, body, true);
    }

    const providerMessageId = data?.key?.id ?? data?.message?.key?.id ?? data?.id;
    if (!providerMessageId) return { delivered: false as const, reason: 'delivery_unconfirmed' };
    return { delivered: true as const, providerMessageId };
  } catch (error) {
    const status = error instanceof Error && 'status' in error ? Number(error.status) : 0;
    return { delivered: false as const, reason: status >= 400 && status < 500 && status !== 408 && error instanceof Error ? error.message : 'delivery_unconfirmed' };
  }
}

export async function sendEvolutionMedia(
  tenantId: string,
  to: string | null | undefined,
  file: File,
  caption?: string | null
) {
  const settings = await tenantEvolutionSettings(tenantId);
  const runtime = await tenantRuntime(tenantId);
  const recipient = digits(to);
  if (!settings.instanceName || !recipient || !runtime) {
    return { delivered: false as const, reason: 'not_configured' };
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');

    const data = file.type.startsWith('audio/')
      ? await evolutionRequest(runtime, `message/sendWhatsAppAudio/${encodeURIComponent(settings.instanceName)}`, {
          method: 'POST',
          body: JSON.stringify({ number: recipient, audio: base64 })
        })
      : await evolutionRequest(runtime, `message/sendMedia/${encodeURIComponent(settings.instanceName)}`, {
          method: 'POST',
          body: JSON.stringify({
            number: recipient,
            mediatype: file.type.startsWith('image/') ? 'image' : 'document',
            mimetype: file.type || 'application/octet-stream',
            caption: caption || '',
            media: base64,
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

function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function verifyEvolutionWebhookToken(instanceName: string, suppliedToken: string) {
  const tenantId = await tenantByInstance(instanceName);
  if (!tenantId) return false;
  const runtime = await tenantRuntime(tenantId);
  return Boolean(runtime && safeEqual(runtime.webhookToken, suppliedToken));
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

function unwrapInboundMessage(message: any) {
  for (let depth = 0; depth < 8 && message; depth++) {
    const nested = message.documentWithCaptionMessage?.message
      ?? message.ephemeralMessage?.message
      ?? message.viewOnceMessage?.message
      ?? message.viewOnceMessageV2?.message
      ?? message.viewOnceMessageV2Extension?.message
      ?? message.editedMessage?.message
      ?? message.deviceSentMessage?.message;
    if (!nested || nested === message) break;
    message = nested;
  }
  return message;
}

function textFromMessage(message: any) {
  return message?.conversation
    || message?.extendedTextMessage?.text
    || message?.imageMessage?.caption
    || message?.videoMessage?.caption
    || message?.documentMessage?.caption
    || message?.buttonsResponseMessage?.selectedDisplayText
    || message?.templateButtonReplyMessage?.selectedDisplayText
    || message?.listResponseMessage?.title
    || message?.interactiveResponseMessage?.body?.text
    || message?.reactionMessage?.text
    || message?.contactMessage?.displayName
    || message?.contactsArrayMessage?.contacts?.map((contact: any) => contact?.displayName).filter(Boolean).join(', ')
    || message?.locationMessage?.name
    || message?.locationMessage?.address
    || message?.liveLocationMessage?.caption
    || message?.pollCreationMessage?.name
    || message?.pollCreationMessageV3?.name
    || '';
}

function inboundType(message: any) {
  if (message?.imageMessage || message?.stickerMessage) return 'image';
  if (message?.audioMessage) return 'audio';
  if (message?.documentMessage || message?.videoMessage) return 'file';
  return 'text';
}

function mediaNode(message: any, type: string) {
  if (type === 'image') return message?.imageMessage || message?.stickerMessage;
  if (type === 'audio') return message?.audioMessage;
  if (type === 'file') return message?.documentMessage || message?.videoMessage;
  return null;
}

function inboundBase64(value: unknown) {
  if (typeof value !== 'string' || value.length > MAX_ATTACHMENT_BASE64_LENGTH + 256) return null;
  const clean = value.replace(/^data:[^,]*;base64,/i, '').replace(/\s/g, '');
  if (!clean || clean.length > MAX_ATTACHMENT_BASE64_LENGTH || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;
  return clean;
}

async function fetchInboundMedia(tenantId: string, instanceName: string, messageId: string) {
  const runtime = await tenantRuntime(tenantId);
  if (!runtime) return null;
  return evolutionRequest(runtime, `chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false })
  });
}

async function saveInboundBase64(
  tenantId: string,
  conversationId: string,
  base64Value: string,
  mime: string,
  fileName: string
) {
  const bytes = new Uint8Array(Buffer.from(base64Value, 'base64'));
  if (!bytes.byteLength || bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error('invalid_attachment_size');
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

async function processInboundMessage(instanceName: string, data: any, recovered = false) {
  const tenantId = await tenantByInstance(instanceName);
  if (!tenantId) return;

  const key = data?.key ?? data?.data?.key;
  const rawMessage = data?.message ?? data?.data?.message;
  const message = unwrapInboundMessage(rawMessage);
  const remoteJid = String(key?.remoteJid ?? '');
  if (!key?.id || key?.fromMe || !remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return;

  if (!message || message.protocolMessage || message.senderKeyDistributionMessage && Object.keys(message).length === 1) return;

  const phone = [remoteJid, key.remoteJidAlt, key.senderPn, data?.remoteJidAlt, data?.data?.remoteJidAlt, data?.senderPn, data?.data?.senderPn]
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.match(/^([1-9]\d{7,14})(?::\d+)?@(?:s\.whatsapp\.net|c\.us)$/i)?.[1])
    .find(Boolean);
  if (!phone) {
    console.warn('[evolution] Mensagem recebida sem número de WhatsApp resolvido');
    return;
  }

  const fresh = await claimEvent(tenantId, String(key.id), 'whatsapp_message', { instance: instanceName });
  if (!fresh) return;

  try {
    const context = [message?.extendedTextMessage, message?.imageMessage, message?.documentMessage,
      message?.audioMessage, message?.videoMessage].find(node => typeof node?.contextInfo?.stanzaId === 'string')?.contextInfo;
    const replyToProviderId = typeof context?.stanzaId === 'string' ? context.stanzaId.trim().slice(0, 512) : null;
    const adContexts = [context, message?.extendedTextMessage?.contextInfo, message?.imageMessage?.contextInfo,
      message?.contextInfo, data?.contextInfo, data?.data?.contextInfo];
    const adContext = adContexts.find(value => value?.externalAdReply?.ctwaClid ||
      value?.ctwaClid || String(value?.externalAdReply?.sourceType ?? '').toLowerCase() === 'ad');
    const ad = adContext?.externalAdReply;
    const jpeg = Array.isArray(ad?.thumbnail?.data) && ad.thumbnail.data.length <= 24576
      ? Buffer.from(ad.thumbnail.data).toString('base64') : ad?.thumbnail;
    const attribution = {
      evolution_instance_name: instanceName,
      ...(adContext ? { meta_referral_type: 'ad', meta_ctwa_ad_id: adContext.externalAdReply?.sourceId ?? null,
        meta_ctwa_clid: ad?.ctwaClid ?? adContext.ctwaClid ?? null,
        ...metaAdPreview(key.id, ad?.title, ad?.mediaUrl, ad?.thumbnailUrl, jpeg) } : {})
    };
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
      attribution,
      createConversation: type !== 'text' || parseAttendanceRating(textFromMessage(message)) === undefined
    });

    const node = mediaNode(message, type);
    let attachment: { path?: string | null; name?: string | null; mime?: string | null; size?: number | null } | undefined;
    let body = textFromMessage(message);
    if (node && base.conversationId) {
      try {
        let base64 = [data?.base64, data?.data?.base64, message?.base64, node.base64]
          .map(inboundBase64).find(Boolean);
        let fetched: any;
        if (!base64) {
          fetched = await fetchInboundMedia(tenantId, instanceName, String(key.id));
          base64 = [fetched?.base64, fetched?.data?.base64].map(inboundBase64).find(Boolean);
        }
        if (!base64) throw new Error('attachment_data_unavailable');
        const reportedMime = [node.mimetype, fetched?.mimetype, fetched?.mimeType, fetched?.data?.mimetype, fetched?.data?.mimeType]
          .map(value => String(value ?? '').split(';', 1)[0].trim().toLowerCase())
          .find(value => value && value !== 'application/octet-stream');
        const mime = type === 'audio' && base64.startsWith('T2dnUw') ? 'audio/ogg'
          : reportedMime || (message?.stickerMessage ? 'image/webp' : 'application/octet-stream');
        const fileName = String(node.fileName || fetched?.fileName || (
          type === 'image' ? 'imagem-whatsapp' : type === 'audio' ? 'audio-whatsapp' : 'arquivo-whatsapp'
        ));
        attachment = await saveInboundBase64(tenantId, base.conversationId, base64, mime, fileName);
      } catch {
        console.warn('[evolution] Falha ao recuperar ou armazenar anexo recebido', { type });
      }
    }

    if (!body) {
      body = message?.stickerMessage ? 'Figurinha recebida' : type === 'audio' ? 'Mensagem de voz' : type === 'image' ? 'Imagem recebida' : type === 'file' ? 'Arquivo recebido' : 'Conteúdo indisponível no CRM. Consulte a conversa no WhatsApp.';
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
      replyToProviderId,
      suppressWelcome: recovered,
      messageType: type,
      attachment,
      createConversation: true
    });

    if (!recovered) await notifyAutomaticConversation(tenantId, received.conversationId);
    return Boolean(received.conversationId);
  } catch (error) {
    await createAdminClient().from('integration_events').delete()
      .eq('tenant_id', tenantId).eq('provider', 'evolution').eq('event_key', String(key.id));
    throw error;
  }
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

// Read only: never changes the contact's WhatsApp profile or privacy settings.
export async function getEvolutionContactPicture(tenantId: string, phone: string) {
  const settings = await tenantEvolutionSettings(tenantId);
  if (settings.provider !== 'evolution' || !settings.instanceName) return null;
  const runtime = await tenantRuntime(tenantId);
  if (!runtime) return null;
  const number = phone.replace(/\D/g, '');
  if (!number) return null;
  const data = await evolutionRequest(runtime, `chat/fetchProfilePictureUrl/${encodeURIComponent(settings.instanceName)}`, {
    method: 'POST', body: JSON.stringify({ number }), signal: AbortSignal.timeout(8000)
  });
  return typeof data?.profilePictureUrl === 'string' ? data.profilePictureUrl : null;
}

export async function recoverEvolutionAttachment(tenantId: string, conversationId: string, messageId: string) {
  const settings = await tenantEvolutionSettings(tenantId);
  if (settings.provider !== 'evolution' || !settings.instanceName) return null;

  const admin = createAdminClient();
  const { data: message, error } = await admin.from('messages')
    .select('provider_message_id,message_type')
    .eq('tenant_id', tenantId).eq('conversation_id', conversationId).eq('id', messageId)
    .is('attachment_path', null).in('message_type', ['image', 'audio', 'file']).maybeSingle();
  if (error) throw error;
  const providerId = message?.provider_message_id;
  if (!message || !providerId || providerId.startsWith('wamid.')) return null;

  const fetched = await fetchInboundMedia(tenantId, settings.instanceName, providerId);
  const media = fetched?.data ?? fetched;
  const rawBase64 = media?.base64 ?? fetched?.base64;
  const base64 = inboundBase64(rawBase64);
  const reportedMime = String(media?.mimetype || media?.mimeType || '').split(';', 1)[0].trim().toLowerCase();
  const dataUrlMime = typeof rawBase64 === 'string' ? rawBase64.match(/^data:([^;,]+);base64,/i)?.[1]?.toLowerCase() : null;
  const mime = message.message_type === 'audio' && base64?.startsWith('T2dnUw') ? 'audio/ogg'
    : message.message_type === 'file' && base64?.startsWith('JVBERi0')
    ? 'application/pdf'
    : reportedMime && reportedMime !== 'application/octet-stream' ? reportedMime : dataUrlMime;
  if (!base64 || !mime) return null;
  if (message.message_type === 'image' && !mime.startsWith('image/')) return null;
  if (message.message_type === 'audio' && !mime.startsWith('audio/')) return null;

  if (message.message_type === 'file' && !['application/pdf', 'text/plain', 'text/csv',
    'application/msword', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(mime)) return null;
  if (mime === 'image/svg+xml') return null;

  const name = typeof media?.fileName === 'string' && media.fileName.trim()
    ? media.fileName.trim().slice(-120)
    : mime === 'application/pdf' ? 'documento-whatsapp.pdf' : 'anexo-whatsapp';
  const attachment = await saveInboundBase64(tenantId, conversationId, base64, mime, name);
  const { data: updated, error: updateError } = await admin.from('messages')
    .update({
      attachment_path: attachment.path,
      attachment_name: attachment.name,
      attachment_mime: attachment.mime,
      attachment_size: attachment.size
    })
    .eq('tenant_id', tenantId).eq('conversation_id', conversationId).eq('id', messageId)
    .is('attachment_path', null).select('id').maybeSingle();
  if (!updated) await admin.storage.from(BUCKET).remove([attachment.path]);
  if (updateError) throw updateError;
  return Boolean(updated);
}

export async function sendEvolutionReaction(tenantId: string, to: string | null | undefined, id: string, fromMe: boolean, emoji: string) {
  const settings = await tenantEvolutionSettings(tenantId);
  const runtime = await tenantRuntime(tenantId);
  const phone = digits(to);
  if (!settings.instanceName || !runtime || !phone) return false;
  try {
    await evolutionRequest(runtime, `message/sendReaction/${encodeURIComponent(settings.instanceName)}`, {
      method: 'POST',
      body: JSON.stringify({ key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe, id }, reaction: emoji })
    });
    return true;
  } catch {
    return false;
  }
}

export async function reconcileRecentEvolutionMessages() {
  const admin = createAdminClient();
  const { data: tenants, error } = await admin.from('tenant_settings')
    .select('tenant_id,evolution_instance_name').eq('whatsapp_provider', 'evolution')
    .not('evolution_instance_name', 'is', null);
  if (error) throw error;

  const since = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  let recovered = 0;
  let failed = 0;
  for (const tenant of tenants ?? []) {
    const instance = tenant.evolution_instance_name?.trim();
    if (!instance) continue;
    try {
      const runtime = await tenantRuntime(tenant.tenant_id);
      if (!runtime) continue;
      const response = await evolutionRequest(runtime, `chat/findMessages/${encodeURIComponent(instance)}`, {
        method: 'POST',
        body: JSON.stringify({ where: { messageTimestamp: { gte: since } }, offset: 100, page: 1 }),
        signal: AbortSignal.timeout(8000)
      });
      const history = response?.data ?? response;
      const records = history?.messages?.records ?? history?.records ?? history?.messages ?? history;
      if (!Array.isArray(records)) throw new Error('invalid_evolution_history');
      const candidates = records.filter(record =>
        record?.key?.fromMe === false && record.key.id && Number(record.messageTimestamp) >= since
      ).sort((a, b) => Number(a.messageTimestamp) - Number(b.messageTimestamp));
      if (!candidates.length) continue;
      const { data: events, error: lookupError } = await admin.from('integration_events')
        .select('event_key').eq('tenant_id', tenant.tenant_id).eq('provider', 'evolution')
        .in('event_key', candidates.map(record => String(record.key.id)));
      if (lookupError) throw lookupError;
      const seen = new Set((events ?? []).map(event => event.event_key));
      const pending = candidates.filter(record => !seen.has(String(record.key.id)));
      const texts = pending.filter(record => {
        const message = unwrapInboundMessage(record.message);
        return inboundType(message) === 'text' && Boolean(textFromMessage(message));
      }).slice(0, 15);
      const audios = pending.filter(record => {
        const raw = record.message;
        return inboundType(unwrapInboundMessage(raw)) === 'audio'
          && !raw?.viewOnceMessage && !raw?.viewOnceMessageV2 && !raw?.viewOnceMessageV2Extension;
      }).slice(0, 2);
      for (const record of [...texts, ...audios]) {
        try {
          if (await processInboundMessage(instance, record, true)) recovered++;
        } catch {
          failed++;
        }
      }
    } catch {
      failed++;
    }
  }
  return { recovered, failed };
}
