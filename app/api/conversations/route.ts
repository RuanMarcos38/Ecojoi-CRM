import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';

const BUCKET = 'ecojoi-message-attachments';
const createSchema = z.object({
  contact_id: z.string().uuid(),
  channel: z.enum(['internal', 'whatsapp', 'instagram', 'facebook', 'email']).default('internal')
});

export async function GET() {
  try {
    const ctx = await requirePermission('conversations.view');
    await requireFeature(ctx, 'atendimento');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('conversations')
      .select('id,status,channel,assigned_to,attendance_state,attendance_changed_at,updated_at,contact:contacts(id,name,email,phone),messages(id,direction,body,status,message_type,attachment_path,attachment_name,attachment_mime,attachment_size,audio_duration_ms,created_at)')
      .eq('tenant_id', ctx.tenantId)
      .order('updated_at', { ascending: false })
      .limit(80);

    if (error) throw error;
    const hydrated = await Promise.all((data ?? []).map(async conversation => {
      const messages = await Promise.all((conversation.messages ?? []).map(async (message: any) => {
        if (!message.attachment_path) return { ...message, attachment_url: null };
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(message.attachment_path, 3600);
        return { ...message, attachment_url: signed?.signedUrl ?? null };
      }));
      messages.sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
      return { ...conversation, messages };
    }));
    return NextResponse.json({ data: hydrated });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'conversation_fetch_failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('conversations.create');
    await requireFeature(ctx, 'atendimento');
    const body = createSchema.parse(await req.json());
    const supabase = await createClient();

    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('id', body.contact_id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (!contact) return NextResponse.json({ error: 'contact_not_found' }, { status: 404 });

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        tenant_id: ctx.tenantId,
        contact_id: body.contact_id,
        channel: body.channel,
        status: 'open',
        assigned_to: ctx.userId,
        attendance_state: 'in_service',
        attendance_changed_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'conversation_create_failed' }, { status: 500 });
  }
}
