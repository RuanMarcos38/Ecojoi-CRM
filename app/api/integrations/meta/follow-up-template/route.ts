import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/context';
import { submitFollowUpTemplate, syncWhatsAppTemplates } from '@/lib/server/meta';
import { getWhatsAppProvider } from '@/lib/server/whatsapp';

export async function DELETE() {
  try {
    const ctx = await requirePermission('conversations.manage');
    if (!['company_admin', 'super_admin'].includes(ctx.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const { error } = await createAdminClient().from('whatsapp_lead_follow_up_settings')
      .update({ enabled: false, updated_at: new Date().toISOString() }).eq('tenant_id', ctx.tenantId);
    if (error) throw error;
    return NextResponse.json({ configured: false });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'follow_up_disable_failed' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const ctx = await requirePermission('conversations.manage');
    if (!['company_admin', 'super_admin'].includes(ctx.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const { data, error } = await createAdminClient().from('whatsapp_lead_follow_up_settings')
      .select('enabled').eq('tenant_id', ctx.tenantId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ configured: data?.enabled === true });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'follow_up_settings_failed' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const ctx = await requirePermission('conversations.manage');
    if (!['company_admin', 'super_admin'].includes(ctx.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (await getWhatsAppProvider(ctx.tenantId) !== 'meta') {
      return NextResponse.json({ error: 'official_provider_required' }, { status: 409 });
    }
    const data = await submitFollowUpTemplate(ctx.tenantId);
    if (!data) return NextResponse.json({ error: 'meta_not_configured' }, { status: 409 });
    const synced = await syncWhatsAppTemplates(ctx.tenantId).then(() => true).catch(() => false);
    const { error } = await createAdminClient().from('whatsapp_lead_follow_up_settings')
      .upsert({ tenant_id: ctx.tenantId, requested_by: ctx.userId, enabled: true, updated_at: new Date().toISOString() });
    if (error) throw error;
    return NextResponse.json({ data, synced, configured: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'meta_template_submission_failed' }, { status: 502 });
  }
}
