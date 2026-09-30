import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  shortcut: z.string().trim().min(1).max(40).regex(/^\/?[a-zA-Z0-9_-]+$/),
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(4000)
});

export async function GET() {
  try {
    const ctx = await requirePermission('conversations.view');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('quick_replies')
      .select('id,shortcut,title,body,active,updated_at')
      .eq('tenant_id', ctx.tenantId)
      .eq('active', true)
      .order('shortcut');
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'quick_replies_fetch_failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requirePermission('conversations.manage');
    const input = schema.parse(await request.json());
    const supabase = await createClient();
    const shortcut = input.shortcut.startsWith('/') ? input.shortcut.slice(1) : input.shortcut;

    const { data, error } = await supabase
      .from('quick_replies')
      .upsert({
        tenant_id: ctx.tenantId,
        shortcut,
        title: input.title,
        body: input.body,
        active: true,
        created_by: ctx.userId,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,shortcut' })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'quick_reply_save_failed' }, { status: 500 });
  }
}
