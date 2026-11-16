import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFeature } from '@/lib/server/feature';
import { sendWhatsAppReaction } from '@/lib/server/meta';
import { getWhatsAppProvider } from '@/lib/server/whatsapp';

const schema = z.object({
  message_id: z.string().uuid(),
  emoji: z.enum(['👍', '❤️', '😂', '😊', '😮', '😢', '🙏', ''])
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission('conversations.send');
    await requireFeature(ctx, 'atendimento');
    const { id } = await params;
    const body = schema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: 'invalid_reaction' }, { status: 400 });
    const { message_id, emoji } = body.data;
    const supabase = await createClient();
    const { data: conversation } = await supabase.from('conversations')
      .select('channel,attendance_state,contact:contacts(phone)')
      .eq('tenant_id', ctx.tenantId).eq('id', id).maybeSingle();
    if (!conversation || conversation.channel !== 'whatsapp') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (conversation.attendance_state !== 'in_service') {
      return NextResponse.json({ error: 'assume_conversation' }, { status: 409 });
    }
    if (await getWhatsAppProvider(ctx.tenantId) !== 'meta') {
      return NextResponse.json({ error: 'provider_not_supported' }, { status: 409 });
    }
    const { data: message } = await supabase.from('messages')
      .select('id,provider_message_id,created_at')
      .eq('tenant_id', ctx.tenantId).eq('conversation_id', id).eq('id', message_id).maybeSingle();
    if (!message?.provider_message_id) return NextResponse.json({ error: 'message_unavailable' }, { status: 409 });
    if (Date.now() - Date.parse(message.created_at) >= 30 * 86400000) {
      return NextResponse.json({ error: 'reaction_expired' }, { status: 409 });
    }
    const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
    if (!(await sendWhatsAppReaction(ctx.tenantId, contact?.phone, message.provider_message_id, emoji))) {
      return NextResponse.json({ error: 'reaction_rejected' }, { status: 502 });
    }
    const { error } = await createAdminClient().from('messages').update({ whatsapp_reaction: emoji || null })
      .eq('tenant_id', ctx.tenantId).eq('conversation_id', id).eq('id', message_id);
    if (error) return NextResponse.json({ error: 'reaction_history_failed' }, { status: 500 });
    return NextResponse.json({ reaction: emoji || null });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'reaction_failed' }, { status: 500 });
  }
}
