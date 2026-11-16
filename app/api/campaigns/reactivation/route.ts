import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWhatsAppProvider } from '@/lib/server/whatsapp';
import { isReactivationTemplate } from '@/lib/server/reactivation';

const columns = 'id,status,processing,cursor_pos,accepted,skipped,last_result,created_at';
const create = z.object({
  id: z.string().uuid(), template_id: z.string().uuid(),
  phones: z.array(z.string().regex(/^[1-9]\d{7,14}$/)).min(1).max(500),
  marketing_opt_in_confirmed: z.literal(true)
});
const change = z.object({ id: z.string().uuid(), action: z.enum(['pause', 'resume', 'cancel']) });

async function context() {
  const ctx = await requirePermission('conversations.manage');
  if (!['company_admin', 'super_admin'].includes(ctx.role)) {
    throw NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return ctx;
}

export async function GET() {
  try {
    const ctx = await context();
    const { data, error } = await createAdminClient().from('whatsapp_reactivation_campaigns')
      .select(columns).eq('tenant_id', ctx.tenantId).order('created_at', { ascending: false }).limit(10);
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'campaign_read_failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await context();
    const payload = create.parse(await request.json());
    const db = createAdminClient();
    const { data: existing, error: existingError } = await db.from('whatsapp_reactivation_campaigns')
      .select(columns).eq('tenant_id', ctx.tenantId).eq('id', payload.id).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return NextResponse.json({ data: existing });
    const { data: heartbeat, error: heartbeatError } = await db.from('whatsapp_reactivation_heartbeat')
      .select('seen_at').eq('id', true).maybeSingle();
    if (heartbeatError) throw heartbeatError;
    if (!heartbeat || Date.now() - Date.parse(heartbeat.seen_at) > 180000) {
      return NextResponse.json({ error: 'worker_offline' }, { status: 503 });
    }
    if (await getWhatsAppProvider(ctx.tenantId) !== 'meta') {
      return NextResponse.json({ error: 'official_provider_required' }, { status: 409 });
    }
    const { data: template, error: templateError } = await db.from('whatsapp_templates')
      .select('id,category,status,components').eq('tenant_id', ctx.tenantId).eq('id', payload.template_id).maybeSingle();
    if (templateError) throw templateError;
    if (!template || !isReactivationTemplate(template)) return NextResponse.json({ error: 'approved_template_required' }, { status: 409 });

    const { data: audience, error: audienceError } = await db.rpc('reactivation_audience', {
      p_tenant: ctx.tenantId, p_phones: [...new Set(payload.phones)]
    });
    if (audienceError) throw audienceError;
    if (!audience?.length) return NextResponse.json({ error: 'no_eligible_contacts' }, { status: 409 });
    const { data, error } = await db.from('whatsapp_reactivation_campaigns').insert({
      id: payload.id, tenant_id: ctx.tenantId, created_by: ctx.userId, template_id: template.id,
      phones: audience.map((item: { phone: string }) => item.phone)
    }).select(columns).single();
    if (error?.code === '23505') return NextResponse.json({ error: 'campaign_already_active' }, { status: 409 });
    if (error) throw error;
    return NextResponse.json({ data, eligible: audience.length }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'invalid_campaign' }, { status: 400 });
    return NextResponse.json({ error: 'campaign_start_failed' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await context();
    const { id, action } = change.parse(await request.json());
    const status = action === 'pause' ? 'paused' : action === 'resume' ? 'queued' : 'cancelled';
    const previous = action === 'pause' ? ['queued'] : action === 'resume' ? ['paused'] : ['queued','paused'];
    const { data, error } = await createAdminClient().from('whatsapp_reactivation_campaigns')
      .update({ status }).eq('tenant_id', ctx.tenantId).eq('id', id)
      .in('status', previous).eq('processing', false).select(columns).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'campaign_busy_or_closed' }, { status: 409 });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'invalid_campaign' }, { status: 400 });
    return NextResponse.json({ error: 'campaign_update_failed' }, { status: 500 });
  }
}
