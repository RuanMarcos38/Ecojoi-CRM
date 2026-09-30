import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';
import { getAiUsageStatus } from '@/lib/server/ai-usage';

const schema = z.object({
  name: z.string().trim().max(80).optional(),
  tone: z.enum(['professional','friendly','consultative','direct']).optional(),
  objective: z.string().trim().max(1000).optional(),
  rules: z.string().trim().max(8000).optional(),
  human_handoff_keywords: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  confidence_handoff: z.coerce.number().min(0).max(1).optional(),
  ai_daily_message_limit: z.coerce.number().int().min(0).max(1000000).optional(),
  attachment_retention_days: z.coerce.number().int().min(1).max(3650).optional()
});

export async function GET() {
  try {
    const ctx = await requirePermission('settings.view');
    const supabase = await createClient();
    const [{ data, error }, usage] = await Promise.all([
      supabase
        .from('tenant_settings')
        .select('ai_agent_config,ai_daily_message_limit,attachment_retention_days')
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle(),
      getAiUsageStatus(ctx.tenantId)
    ]);
    if (error) throw error;
    return NextResponse.json({
      data: {
        ...(data?.ai_agent_config ?? {}),
        ai_daily_message_limit: data?.ai_daily_message_limit ?? 1000,
        attachment_retention_days: data?.attachment_retention_days ?? 365,
        usage_today: usage.used,
        usage_remaining: usage.remaining
      }
    });
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
    const { ai_daily_message_limit, attachment_retention_days, ...agentConfig } = input;
    const { error } = await supabase
      .from('tenant_settings')
      .upsert({
        tenant_id: ctx.tenantId,
        ai_agent_config: agentConfig,
        ...(ai_daily_message_limit !== undefined ? { ai_daily_message_limit } : {}),
        ...(attachment_retention_days !== undefined ? { attachment_retention_days } : {}),
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
