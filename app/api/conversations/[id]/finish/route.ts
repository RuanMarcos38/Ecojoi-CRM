import { admitWaitingAttendance } from '@/lib/server/attendance-capacity';
import { after, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';
import { attendanceSurvey } from '@/lib/server/attendance-survey';
import { canSendFreeformWhatsApp, sendWhatsAppText } from '@/lib/server/whatsapp';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission('conversations.manage');
    await requireFeature(ctx, 'atendimento');
    const { id } = await params;
    const supabase = await createClient();
    const now = new Date().toISOString();
    const { data: conversation, error } = await supabase.from('conversations')
      .update({ status: 'closed', updated_at: now, attendance_changed_at: now })
      .eq('tenant_id', ctx.tenantId).eq('id', id).neq('status', 'closed')
      .eq('assigned_to', ctx.userId).eq('attendance_state', 'in_service')
      .select('channel,assigned_to,last_inbound_at,contact:contacts(phone)').maybeSingle();
    if (error) throw error;
    if (!conversation) {
      const { data: current, error } = await supabase.from('conversations').select('status,assigned_to')
        .eq('tenant_id', ctx.tenantId).eq('id', id).maybeSingle();
      if (error) throw error;
      if (current?.status === 'closed' && current.assigned_to === ctx.userId) {
        return NextResponse.json({ survey: 'already_closed', message: null });
      }
      return NextResponse.json({ error: 'conversation_unavailable' }, { status: 409 });
    }

    if (conversation.assigned_to) {
      const assignee = conversation.assigned_to;
      after(() => admitWaitingAttendance(ctx.tenantId, assignee).catch(() => {
        console.warn('[attendance] Falha ao admitir próximo atendimento da fila');
      }));
    }

    let surveyMessage = null;
    let survey = 'not_applicable';
    if (conversation.channel === 'whatsapp') {
      survey = 'failed';
      try {
        const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
        if (!(await canSendFreeformWhatsApp(ctx.tenantId, conversation.last_inbound_at))) survey = 'window_closed';
        else if (contact?.phone) {
          const { data: message, error: insertError } = await supabase.from('messages').insert({
            tenant_id: ctx.tenantId, conversation_id: id, direction: 'outbound', body: attendanceSurvey,
            sender_user_id: ctx.userId, status: 'queued', message_type: 'text'
          }).select('*').single();
          if (insertError) throw insertError;
          const phone = contact.phone;
          survey = 'queued';
          surveyMessage = message;
          after(async () => {
            let providerMessageId: string | null = null;
            try {
              const result = await sendWhatsAppText(ctx.tenantId, phone, attendanceSurvey);
              if (result.delivered) providerMessageId = result.providerMessageId ?? null;
            } catch {
              console.warn('[attendance] Falha ao enviar avaliação');
            }
            const { error } = await supabase.from('messages')
              .update({ status: providerMessageId ? 'sent' : 'failed', provider_message_id: providerMessageId })
              .eq('tenant_id', ctx.tenantId).eq('id', message.id);
            if (error) console.warn('[attendance] Falha ao atualizar o envio da avaliação');
          });
        }
      } catch {
        survey = 'failed';
      }
    }

    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'conversation.finish',
      entity: 'conversation', entityId: id, metadata: { survey } }).catch(() => {});
    return NextResponse.json({ survey, message: surveyMessage });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'conversation_finish_failed' }, { status: 500 });
  }
}
