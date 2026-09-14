import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { audit } from '@/lib/server/audit';

const schema = z.object({
  title: z.string().min(2).max(180),
  stage: z.enum(['new','qualification','proposal','closing','won','lost']).default('new'),
  value: z.coerce.number().min(0).default(0),
  probability: z.coerce.number().int().min(0).max(100).default(10),
  contact_id: z.string().uuid().optional().nullable()
});

export async function GET() {
  try {
    const ctx = await requirePermission('deals.view');
    const supabase = await createClient();
    const { data, error } = await supabase.from('deals')
      .select('id,title,stage,value,probability,contact_id,stage_changed_at,created_at,updated_at,contact:contacts(id,name,phone,email)')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'deals_fetch_failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('deals.create');
    const body = schema.parse(await req.json());
    const supabase = await createClient();
    if (body.contact_id) {
      const { data: contact } = await supabase.from('contacts').select('id').eq('id', body.contact_id).eq('tenant_id', ctx.tenantId).maybeSingle();
      if (!contact) return NextResponse.json({ error: 'contact_not_found' }, { status: 404 });
    }
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('deals').insert({
      ...body,
      tenant_id: ctx.tenantId,
      owner_id: ctx.userId,
      stage_changed_at: now
    }).select().single();
    if (error) throw error;
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'deal.create', entity: 'deal', entityId: data.id, metadata: { stage: body.stage } });
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'deal_create_failed' }, { status: 500 });
  }
}
