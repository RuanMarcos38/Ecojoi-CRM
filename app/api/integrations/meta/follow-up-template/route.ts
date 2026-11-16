import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { submitFollowUpTemplate, syncWhatsAppTemplates } from '@/lib/server/meta';
import { getWhatsAppProvider } from '@/lib/server/whatsapp';

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
    return NextResponse.json({ data, synced });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'meta_template_submission_failed' }, { status: 502 });
  }
}
