import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  name: z.string().trim().min(2).max(180),
  text: z.string().trim().min(1).max(120000)
});

export async function GET() {
  try {
    const ctx = await requirePermission('settings.view');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('ai_knowledge_documents')
      .select('id,name,mime_type,active,created_at,updated_at')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'knowledge_fetch_failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requirePermission('settings.manage');
    const input = schema.parse(await request.json());
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('ai_knowledge_documents')
      .insert({
        tenant_id: ctx.tenantId,
        name: input.name,
        mime_type: 'text/plain',
        extracted_text: input.text,
        active: true,
        created_by: ctx.userId
      })
      .select('id,name,active,created_at')
      .single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'knowledge_create_failed' }, { status: 500 });
  }
}
