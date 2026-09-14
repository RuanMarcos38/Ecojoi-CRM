import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { audit } from '@/lib/server/audit';

const schema = z.object({
  name: z.string().min(2).max(120),
  stage: z.enum(['new','qualification','proposal','closing','won','lost']),
  wait_minutes: z.coerce.number().int().min(1).max(525600),
  channel: z.enum(['internal','whatsapp','email']).default('internal'),
  message_template: z.string().min(1).max(4000),
  enabled: z.coerce.boolean().default(true)
});

export async function GET() {
  try {
    const ctx = await requirePermission('automations.view');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('pipeline_message_rules')
      .select('id,name,stage,wait_minutes,channel,message_template,enabled,created_at,updated_at')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'pipeline_rules_fetch_failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('automations.manage');
    const body = schema.parse(await req.json());
    const supabase = await createClient();
    const { data, error } = await supabase.from('pipeline_message_rules').insert({
      ...body,
      tenant_id: ctx.tenantId,
      created_by: ctx.userId
    }).select().single();
    if (error) throw error;
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'pipeline.rule_create', entity: 'pipeline_rule', entityId: data.id, metadata: { stage: body.stage, wait_minutes: body.wait_minutes, channel: body.channel } });
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'pipeline_rule_create_failed' }, { status: 500 });
  }
}
