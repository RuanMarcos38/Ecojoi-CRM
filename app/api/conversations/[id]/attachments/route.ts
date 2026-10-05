import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { audit } from '@/lib/server/audit';
import { isWhatsAppWindowOpen } from '@/lib/server/meta';
import { enqueueOutbound } from '@/lib/server/outbound-queue';
import { canSendHumanMessage } from '@/lib/crm/concurrency';

const BUCKET = 'ecojoi-message-attachments';
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED = new Set([
  'image/jpeg','image/png','image/webp','image/gif',
  'audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav',
  'application/pdf','text/plain','text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

function safeName(name: string) {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-120) || 'arquivo';
}

function messageType(file: File) {
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  return 'file';
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission('conversations.send');
    await requireFeature(ctx, 'atendimento');
    const { id } = await params;
    const form = await req.formData();
    const file = form.get('file');
    const caption = String(form.get('caption') ?? '').trim().slice(0, 2000);
    const durationRaw = Number(form.get('duration_ms') ?? 0);
    const durationMs = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : null;

    if (!(file instanceof File)) return NextResponse.json({ error: 'file_required' }, { status: 400 });
    if (!file.size || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'file_too_large' }, { status: 400 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'unsupported_file_type' }, { status: 400 });

    const supabase = await createClient();
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id,status,assigned_to,channel,attendance_state,last_inbound_at,first_response_at,contact:contacts(phone)')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (conversationError) throw conversationError;
    if (!conversation) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!canSendHumanMessage({userId:ctx.userId,assignedTo:conversation.assigned_to,state:conversation.attendance_state,status:conversation.status})) return NextResponse.json({error:'conversation_not_assigned_to_you'},{status:409});
    if (conversation.attendance_state !== 'in_service') {
      return NextResponse.json({ error: 'conversation_not_in_human_service' }, { status: 409 });
    }
    if (conversation.channel === 'whatsapp' && !isWhatsAppWindowOpen(conversation.last_inbound_at)) {
      return NextResponse.json({ error: 'whatsapp_window_closed', template_required: true }, { status: 409 });
    }

    const path = `${ctx.tenantId}/${id}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false
    });
    if (uploadError) throw uploadError;

    const type = messageType(file);
    const initialStatus = conversation.channel === 'internal' ? 'sent' : 'queued';
    const { data, error } = await supabase.from('messages').insert({
      tenant_id: ctx.tenantId,
      conversation_id: id,
      direction: 'outbound',
      body: caption || (type === 'audio' ? 'Mensagem de voz' : file.name),
      status: initialStatus,
      sender_user_id: ctx.userId,
      message_type: type,
      attachment_path: path,
      attachment_name: file.name,
      attachment_mime: file.type,
      attachment_size: file.size,
      audio_duration_ms: type === 'audio' ? durationMs : null
    }).select().single();

    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw error;
    }

    let delivery = initialStatus;
    let providerMessageId: string | null = null;
    let queueId: string | null = null;

    if(conversation.channel==='whatsapp'){
      const contact=Array.isArray(conversation.contact)?conversation.contact[0]:conversation.contact;
      queueId=await enqueueOutbound({tenantId:ctx.tenantId,conversationId:id,messageId:data.id,channel:'whatsapp',payload:{kind:'media',to:contact?.phone??'',storagePath:path,fileName:file.name,mime:file.type,caption:caption||null,actor:'human',actorUserId:ctx.userId}});
    }

    const now = new Date().toISOString();
    await supabase.from('conversations').update({
      updated_at: now,
      ...(delivery==='sent'?{last_outbound_at:now,first_response_at:conversation.first_response_at??now}:{})
    }).eq('id', id).eq('tenant_id', ctx.tenantId);

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'message.attachment_send',
      entity: 'conversation',
      entityId: id,
      metadata: { type, status: delivery, channel: conversation.channel, queue_id: queueId }
    });

    return NextResponse.json({
      data: { ...data, status: delivery, provider_message_id: providerMessageId },
      delivery,
      queue_id: queueId
    }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'attachment_send_failed' }, { status: 500 });
  }
}
