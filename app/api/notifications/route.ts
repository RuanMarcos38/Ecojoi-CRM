import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const patchSchema = z.object({
  id: z.string().uuid().optional(),
  all: z.boolean().optional()
}).refine(value => value.id || value.all, { message: 'id_or_all_required' });

export async function GET() {
  try {
    const ctx = await requirePermission('contacts.view');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('notifications')
      .select('id,type,title,body,entity_type,entity_id,priority,read_at,created_at')
      .eq('tenant_id', ctx.tenantId)
      .or(`user_id.is.null,user_id.eq.${ctx.userId}`)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'notifications_fetch_failed' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requirePermission('contacts.view');
    const input = patchSchema.parse(await request.json());
    const supabase = await createClient();
    const now = new Date().toISOString();

    let query = supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('tenant_id', ctx.tenantId)
      .or(`user_id.is.null,user_id.eq.${ctx.userId}`);

    if (input.id) query = query.eq('id', input.id);
    const { error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'notifications_update_failed' }, { status: 500 });
  }
}
