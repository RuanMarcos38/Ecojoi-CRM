import { createAdminClient } from '@/lib/supabase/admin';
import { canSendFreeformWhatsApp, sendWhatsAppText, sendWhatsAppTemplate, sendWhatsAppMedia } from '@/lib/server/whatsapp';

const BUCKET = 'ecojoi-message-attachments';

type QueuePayload =
  | { kind: 'text'; to: string; body: string; replyToProviderId?: string }
  | { kind: 'template'; to: string; name: string; language?: string; components?: unknown[] }
  | { kind: 'media'; to: string; storagePath: string; fileName: string; mime: string; caption?: string | null };

export async function enqueueOutbound(input: {
  tenantId: string;
  conversationId: string;
  messageId?: string | null;
  channel: string;
  payload: QueuePayload;
  error?: string | null;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('outbound_message_queue')
    .insert({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      message_id: input.messageId ?? null,
      channel: input.channel,
      payload: input.payload,
      status: 'pending',
      attempts: 0,
      max_attempts: 5,
      next_attempt_at: new Date().toISOString(),
      last_error: input.error ?? null
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

function nextDelayMinutes(attempts: number) {
  return Math.min(60, Math.max(1, 2 ** Math.max(0, attempts)));
}

async function deliverWhatsApp(tenantId: string, payload: QueuePayload) {
  if (payload.kind === 'text') {
    return payload.replyToProviderId
      ? sendWhatsAppText(tenantId, payload.to, payload.body, payload.replyToProviderId)
      : sendWhatsAppText(tenantId, payload.to, payload.body);
  }

  if (payload.kind === 'template') {
    return sendWhatsAppTemplate(
      tenantId,
      payload.to,
      payload.name,
      payload.language ?? 'pt_BR',
      payload.components ?? []
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(payload.storagePath);
  if (error || !data) return { delivered: false as const, reason: 'queued_media_not_found' };
  const file = new File([await data.arrayBuffer()], payload.fileName, { type: payload.mime });
  return sendWhatsAppMedia(tenantId, payload.to, file, payload.caption ?? null);
}

export async function queuePipelineMessages(tenantId?: string) {
  const admin = createAdminClient();
  let query = admin.from('messages')
    .select('id,tenant_id,conversation_id,created_at,body,pipeline_automation_runs!inner(id),outbound_message_queue(),conversations!inner(status,channel,last_inbound_at,last_outbound_at,contacts(phone))')
    .eq('direction', 'outbound').eq('status', 'queued').eq('message_type', 'text')
    .is('provider_message_id', null).is('outbound_message_queue', null)
    .eq('pipeline_automation_runs.status', 'queued').eq('conversations.channel', 'whatsapp')
    .order('created_at', { ascending: true }).limit(50);
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query;
  if (error) throw error;

  let queued = 0;
  let skipped = 0;
  for (const message of data ?? []) {
    const conversation = Array.isArray(message.conversations) ? message.conversations[0] : message.conversations;
    const contacts = conversation?.contacts;
    const phone = (Array.isArray(contacts) ? contacts[0] : contacts)?.phone;
    const created = Date.parse(message.created_at);
    const superseded = [conversation?.last_inbound_at, conversation?.last_outbound_at]
      .some(value => value && Date.parse(value) > created);
    if (!phone || conversation.status === 'closed' || superseded ||
        !(await canSendFreeformWhatsApp(message.tenant_id, conversation.last_inbound_at))) {
      const { error: markError } = await admin.from('pipeline_automation_runs')
        .update({ status: 'failed', error: 'whatsapp_automation_no_longer_eligible' })
        .eq('tenant_id', message.tenant_id).eq('message_id', message.id).eq('status', 'queued');
      if (markError) throw markError;
      await admin.from('messages').update({ status: 'failed' })
        .eq('tenant_id', message.tenant_id).eq('id', message.id).eq('status', 'queued');
      skipped++;
      continue;
    }
    // The message UUID is also the queue UUID for pipeline jobs, so overlapping ticks deduplicate.
    const { data: inserted, error: queueError } = await admin.from('outbound_message_queue')
      .upsert({
        id: message.id, tenant_id: message.tenant_id, conversation_id: message.conversation_id,
        message_id: message.id, channel: 'whatsapp',
        payload: { kind: 'text', to: phone, body: message.body }
      }, { onConflict: 'id', ignoreDuplicates: true }).select('id');
    if (queueError) throw queueError;
    queued += inserted?.length ?? 0;
  }
  return { queued, skipped };
}

export async function processOutboundQueue(limit = 20, tenantId?: string, pipelineOnly = false) {
  const admin = createAdminClient();
  const table = admin.from('outbound_message_queue');
  const selection = pipelineOnly
    ? table.select('id,tenant_id,conversation_id,message_id,channel,payload,status,attempts,max_attempts,messages!inner(pipeline_automation_runs!inner(id))')
    : table.select('id,tenant_id,conversation_id,message_id,channel,payload,status,attempts,max_attempts');
  let query = selection
    .in('status', ['pending','failed'])
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(Math.min(100, Math.max(1, limit)));

  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data: jobs, error } = await query;
  if (error) throw error;

  let sent = 0;
  let failed = 0;
  let dead = 0;

  for (const job of jobs ?? []) {
    const { data: claim } = await admin
      .from('outbound_message_queue')
      .update({ status: 'processing', locked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .in('status', ['pending','failed'])
      .select('id')
      .maybeSingle();

    if (!claim) continue;

    try {
      const payload = job.payload as QueuePayload;
      let result;
      if (job.channel !== 'whatsapp') {
        result = { delivered: false as const, reason: 'unsupported_channel' };
      } else if (payload.kind === 'template') {
        result = await deliverWhatsApp(job.tenant_id, payload);
      } else {
        const { data: conversation, error: conversationError } = await admin.from('conversations')
          .select('last_inbound_at').eq('tenant_id', job.tenant_id).eq('id', job.conversation_id).single();
        if (conversationError) throw conversationError;
        result = await canSendFreeformWhatsApp(job.tenant_id, conversation.last_inbound_at)
          ? await deliverWhatsApp(job.tenant_id, payload)
          : { delivered: false as const, reason: 'whatsapp_window_closed' };
      }

      if (result.delivered) {
        await admin
          .from('outbound_message_queue')
          .update({
            status: 'sent',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_error: null,
            locked_at: null
          })
          .eq('id', job.id);

        if (job.message_id) {
          await admin
            .from('messages')
            .update({
              status: 'sent',
              provider_message_id: result.providerMessageId ?? null
            })
            .eq('tenant_id', job.tenant_id)
            .eq('id', job.message_id);
        }
        sent += 1;
        continue;
      }

      const attempts = Number(job.attempts ?? 0) + 1;
      const isDead = ['whatsapp_window_closed', 'delivery_unconfirmed'].includes(result.reason) || attempts >= Number(job.max_attempts ?? 5);
      await admin
        .from('outbound_message_queue')
        .update({
          status: isDead ? 'dead_letter' : 'failed',
          attempts,
          next_attempt_at: new Date(Date.now() + nextDelayMinutes(attempts) * 60_000).toISOString(),
          last_error: result.reason ?? 'delivery_failed',
          locked_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);

      if (isDead) {
        if (job.message_id) await admin.from('messages').update({ status: 'failed' })
          .eq('tenant_id', job.tenant_id).eq('id', job.message_id).eq('status', 'queued');
        dead += 1;
      } else failed += 1;
    } catch (error) {
      const attempts = Number(job.attempts ?? 0) + 1;
      const isDead = attempts >= Number(job.max_attempts ?? 5);
      await admin
        .from('outbound_message_queue')
        .update({
          status: isDead ? 'dead_letter' : 'failed',
          attempts,
          next_attempt_at: new Date(Date.now() + nextDelayMinutes(attempts) * 60_000).toISOString(),
          last_error: error instanceof Error ? error.message.slice(0, 1000) : 'queue_processing_failed',
          locked_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);
      if (isDead) {
        if (job.message_id) await admin.from('messages').update({ status: 'failed' })
          .eq('tenant_id', job.tenant_id).eq('id', job.message_id).eq('status', 'queued');
        dead += 1;
      } else failed += 1;
    }
  }

  return { processed: (jobs ?? []).length, sent, failed, dead };
}
