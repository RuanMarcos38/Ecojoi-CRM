import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { syncWhatsAppTemplates } from '@/lib/server/meta';

export async function GET() {
  try {
    const ctx = await requirePermission('conversations.view');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .select('id,meta_template_id,name,language,category,status,components,last_synced_at,updated_at')
      .eq('tenant_id', ctx.tenantId)
      .order('name');
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'whatsapp_templates_fetch_failed' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const ctx = await requirePermission('conversations.manage');
    const result = await syncWhatsAppTemplates(ctx.tenantId);
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'whatsapp_templates_sync_failed' }, { status: 502 });
  }
}
