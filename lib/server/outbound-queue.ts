import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppText, sendWhatsAppTemplate, sendWhatsAppMedia } from '@/lib/server/meta';

const BUCKET = 'ecojoi-message-attachments';

type QueuePayload =
  | { kind: 'text'; to: string; body: string }
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
    return sendWhatsAppText(tenantId, payload.to, payload.body);
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

export async function processOutboundQueue(limit = 20, tenantId?: string) {
  const admin = createAdminClient();
  let query = admin
    .from('outbound_message_queue')
    .select('id,tenant_id,conversation_id,message_id,channel,payload,status,attempts,max_attempts')
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
      const result = job.channel === 'whatsapp'
        ? await deliverWhatsApp(job.tenant_id, payload)
        : { delivered: false as const, reason: 'unsupported_channel' };

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
      const isDead = attempts >= Number(job.max_attempts ?? 5);
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

      if (isDead) dead += 1;
      else failed += 1;
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
      if (isDead) dead += 1;
      else failed += 1;
    }
  }

  return { processed: (jobs ?? []).length, sent, failed, dead };
}
