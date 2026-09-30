import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
  tenant_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  body: z.string().trim().min(1).max(4000)
});

export async function POST(req: Request) {
  try {
    const expected = process.env.AI_AGENT_WEBHOOK_TOKEN?.trim();
    if (!expected) {
      return NextResponse.json({ error: 'ai_agent_not_configured' }, { status: 503 });
    }

    const authorization = req.headers.get('authorization') ?? '';
    if (authorization !== 'Bearer ' + expected) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const input = schema.parse(await req.json());
    const supabase = createAdminClient();

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id,channel,attendance_state')
      .eq('id', input.conversation_id)
      .eq('tenant_id', input.tenant_id)
      .maybeSingle();

    if (conversationError) throw conversationError;
    if (!conversation) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (conversation.attendance_state !== 'automatic') {
      return NextResponse.json({ error: 'conversation_not_in_automatic_mode' }, { status: 409 });
    }

    const status = conversation.channel === 'internal' ? 'sent' : 'queued';
    const { data, error } = await supabase
      .from('messages')
      .insert({
        tenant_id: input.tenant_id,
        conversation_id: input.conversation_id,
        direction: 'outbound',
        body: input.body,
        status,
        message_type: 'text'
      })
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', input.conversation_id)
      .eq('tenant_id', input.tenant_id);

    return NextResponse.json({ data, delivery: status }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'ai_agent_reply_failed' }, { status: 500 });
  }
}
