import { createAdminClient } from '@/lib/supabase/admin';

export const attendanceSurvey = 'Obrigado por falar com a Ecojoi! 😊 De 0 a 10, que nota você dá ao nosso atendimento? Pode responder por aqui.\n\nSe puder, conte também como foi sua experiência no Google. Sua opinião ajuda nossa equipe a melhorar.\nhttps://g.page/r/CZEiyMj9j4CCEBM/review';

export function parseAttendanceRating(message?: string | null) {
  const match = message?.trim().match(/^(?:nota\s*)?(10|[0-9])[.!]?$/i);
  return match ? Number(match[1]) : undefined;
}

type Admin = ReturnType<typeof createAdminClient>;
type Survey = { id: string; conversation_id: string; sender_user_id: string };

export async function findAttendanceSurvey(admin: Admin, tenantId: string, contactId: string, reference?: string | null) {
  let query = admin.from('messages')
    .select('id,conversation_id,sender_user_id,created_at,conversations!inner(contact_id,status,channel)')
    .eq('tenant_id', tenantId).eq('direction', 'outbound').eq('body', attendanceSurvey)
    .eq('conversations.contact_id', contactId).eq('conversations.status', 'closed').eq('conversations.channel', 'whatsapp')
    .in('status', ['sent', 'delivered', 'read'])
    .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
  if (reference) query = query.eq('provider_message_id', reference);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.sender_user_id) return null;
  if (!reference) {
    const { count, error } = await admin.from('conversations').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('contact_id', contactId).eq('channel', 'whatsapp').neq('status', 'closed')
      .or(`last_inbound_at.gt.${data.created_at},last_outbound_at.gt.${data.created_at}`);
    if (error || count) return null;
  }
  const { data: previous, error: noteError } = await admin.from('conversation_notes').select('id')
    .eq('tenant_id', tenantId).eq('id', data.id).maybeSingle();
  if (noteError) throw noteError;
  return previous ? null : { id: data.id, conversation_id: data.conversation_id, sender_user_id: data.sender_user_id };
}

export async function saveAttendanceRating(admin: Admin, tenantId: string, survey: Survey, rating: number) {
  const { error } = await admin.from('conversation_notes').upsert({
    id: survey.id, tenant_id: tenantId, conversation_id: survey.conversation_id, user_id: survey.sender_user_id,
    body: `Avaliação do cliente: ${rating}/10.${rating <= 8 ? ' Acompanhamento da equipe recomendado.' : ''}`
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
}
