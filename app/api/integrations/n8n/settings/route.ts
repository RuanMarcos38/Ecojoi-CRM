import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { getN8nStatus } from '@/lib/server/n8n';
import { audit } from '@/lib/server/audit';

const patchSchema = z.object({
  n8n_ai_enabled: z.boolean(),
  n8n_webhook_url: z.union([z.string().trim().url().max(2000), z.literal(''), z.null()])
});

export async function GET() {
  try {
    const ctx = await requirePermission('automations.view');
    const supabase = await createClient();
    const [{ data: settings, error }, runtime] = await Promise.all([
      supabase
        .from('tenant_settings')
        .select('n8n_ai_enabled,n8n_webhook_url,n8n_workflow_id')
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle(),
      getN8nStatus(ctx.tenantId)
    ]);

    if (error) throw error;
    return NextResponse.json({ data: { ...(settings ?? {}), ...runtime } });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'n8n_settings_fetch_failed' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requirePermission('automations.manage');
    const input = patchSchema.parse(await request.json());
    const supabase = await createClient();

    const { error } = await supabase
      .from('tenant_settings')
      .upsert({
        tenant_id: ctx.tenantId,
        n8n_ai_enabled: input.n8n_ai_enabled,
        n8n_webhook_url: input.n8n_webhook_url || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id' });

    if (error) throw error;

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'n8n.settings.update',
      entity: 'tenant',
      entityId: ctx.tenantId,
      metadata: {
        n8n_ai_enabled: input.n8n_ai_enabled,
        webhook_configured: Boolean(input.n8n_webhook_url)
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'n8n_settings_update_failed' }, { status: 500 });
  }
}
