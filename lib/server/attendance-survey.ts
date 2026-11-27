import { sendWhatsAppText } from '@/lib/server/whatsapp';
import { whatsappPhoneVariants } from '@/lib/whatsapp-phone-variants';
import { createAdminClient } from '@/lib/supabase/admin';

const legacySurvey = 'Obrigado por falar com a Ecojoi! 😊 De 0 a 10, que nota você dá ao nosso atendimento? Pode responder por aqui.\n\nSe puder, conte também como foi sua experiência no Google. Sua opinião ajuda nossa equipe a melhorar.\nhttps://g.page/r/CZEiyMj9j4CCEBM/review';

export const attendanceSurvey = 'De 0 a 10, que nota você dá ao atendimento da Ecojoi? Pode responder por aqui. 😊';
const reviewInvitation = 'Obrigado pela nota e por falar com a Ecojoi! 😊 Se quiser, conte como foi sua experiência no Google:\nhttps://g.page/r/CZEiyMj9j4CCEBM/review';

export function parseAttendanceRating(message?: string | null) {
  const match = message?.trim().match(/^(?:nota\s*)?(10|[0-9])[.!]?$/i);
  return match ? Number(match[1]) : undefined;
}

type Admin = ReturnType<typeof createAdminClient>;
type Survey = { id: string; conversation_id: string; sender_user_id: string; sendReview: boolean };

export async function findAttendanceSurvey(admin: Admin, tenantId: string, contactId: string, reference?: string | null, phone?: string | null, receivedAt?: string) {
  const contactIds = [contactId];
  if (phone) {
    const { data, error } = await admin.from('contacts').select('id')
      .eq('tenant_id', tenantId).in('phone', whatsappPhoneVariants(phone));
    if (error) throw error;
    for (const contact of data ?? []) contactIds.push(contact.id);
  }
  const replyTime = receivedAt ?? new Date().toISOString();
  // Historical Evolution timestamps have second precision.
  const latestPrompt = receivedAt ? new Date(Date.parse(receivedAt) + 999).toISOString() : replyTime;
  let query = admin.from('messages')
    .select('id,conversation_id,sender_user_id,created_at,body,conversations!inner(contact_id,status,channel)')
    .eq('tenant_id', tenantId).eq('direction', 'outbound').in('body', [attendanceSurvey, legacySurvey])
    .in('conversations.contact_id', contactIds).eq('conversations.status', 'closed').eq('conversations.channel', 'whatsapp')
    .in('status', ['sent', 'delivered', 'read'])
    .gte('created_at', new Date(Date.parse(replyTime) - 7 * 86400000).toISOString()).lte('created_at', latestPrompt);
  if (reference) query = query.eq('provider_message_id', reference);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.sender_user_id) return null;
  if (!reference) {
    const { data: newerConversation, error } = await admin.from('messages')
      .select('id,conversations!inner(contact_id,status,channel)')
      .eq('tenant_id', tenantId).in('conversations.contact_id', contactIds)
      .eq('conversations.channel', 'whatsapp').neq('conversations.status', 'closed')
      .eq('direction', 'inbound').gt('created_at', data.created_at).lt('created_at', replyTime)
      .limit(1).maybeSingle();
    if (error) throw error;
    if (newerConversation) return null;
  }
  return { id: data.id, conversation_id: data.conversation_id, sender_user_id: data.sender_user_id, sendReview: data.body === attendanceSurvey };
}

export async function saveAttendanceRating(admin: Admin, tenantId: string, survey: Survey, rating: number, phone?: string | null) {
  const { data: recorded, error } = await admin.from('conversation_notes').upsert({
    id: survey.id, tenant_id: tenantId, conversation_id: survey.conversation_id, user_id: survey.sender_user_id,
    body: `Avaliação do cliente: ${rating}/10.${rating <= 8 ? ' Acompanhamento da equipe recomendado.' : ''}`
  }, { onConflict: 'id', ignoreDuplicates: true }).select('id').maybeSingle();
  if (error) throw error;
  if (!recorded || !survey.sendReview || !phone) return;

  const { data: invitation, error: insertError } = await admin.from('messages').insert({
    tenant_id: tenantId, conversation_id: survey.conversation_id, direction: 'outbound',
    sender_user_id: survey.sender_user_id, body: reviewInvitation, status: 'queued', message_type: 'text'
  }).select('id').single();
  if (insertError) throw insertError;
  let providerId: string | null = null;
  try {
    const result = await sendWhatsAppText(tenantId, phone, reviewInvitation);
    if (result.delivered) providerId = result.providerMessageId ?? null;
  } finally {
    const { error: updateError } = await admin.from('messages')
      .update({ status: providerId ? 'sent' : 'failed', provider_message_id: providerId })
      .eq('tenant_id', tenantId).eq('id', invitation.id);
    if (updateError) throw updateError;
  }
}
