import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const schema = z.object({
  name: z.string().trim().max(80).optional(),
  tone: z.enum(['professional','friendly','consultative','direct']).optional(),
  objective: z.string().trim().max(1000).optional(),
  rules: z.string().trim().max(8000).optional(),
  human_handoff_keywords: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  confidence_handoff: z.coerce.number().min(0).max(1).optional()
});

export async function GET() {
  try {
    const ctx = await requirePermission('settings.view');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tenant_settings')
      .select('ai_agent_config')
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ data: data?.ai_agent_config ?? {} });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'ai_settings_fetch_failed' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requirePermission('settings.manage');
    const input = schema.parse(await request.json());
    const supabase = await createClient();
    const { error } = await supabase
      .from('tenant_settings')
      .upsert({
        tenant_id: ctx.tenantId,
        ai_agent_config: input,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id' });
    if (error) throw error;

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'ai_agent.settings.update',
      entity: 'tenant',
      entityId: ctx.tenantId,
      metadata: { fields: Object.keys(input) }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'ai_settings_update_failed' }, { status: 500 });
  }
}
