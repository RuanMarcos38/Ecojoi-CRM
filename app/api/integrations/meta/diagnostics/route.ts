import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const ctx = await requirePermission('settings.view');
    const admin = createAdminClient();
    const { data, error } = await admin.from('tenant_settings')
      .select('meta_waba_id,meta_phone_number_id')
      .eq('tenant_id', ctx.tenantId).maybeSingle();
    if (error) throw error;

    const phoneId = data?.meta_phone_number_id?.trim() || '';
    const wabaId = data?.meta_waba_id?.trim() || '';
    const token = process.env.META_GRAPH_ACCESS_TOKEN?.trim() || '';
    const credentialsConfigured = Boolean(token);
    const identifiersConfigured = Boolean(phoneId && wabaId);
    const webhookConfigured = Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() && process.env.META_APP_SECRET?.trim());
    const base = { credentialsConfigured, identifiersConfigured, webhookConfigured };

    if (!identifiersConfigured || !credentialsConfigured) {
      return NextResponse.json({ data: { ...base, connected: false, reason: !identifiersConfigured ? 'missing_identifiers' : 'missing_access_token' } }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const version = process.env.META_GRAPH_API_VERSION?.trim() || 'v23.0';
    const query = async (asset: string, fields: string) => {
      const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(asset)}?fields=${fields}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) return null;
      return response.json();
    };
    const [phone, waba] = await Promise.all([
      query(phoneId, 'id,display_phone_number,verified_name'),
      query(wabaId, 'id,name')
    ]);
    const connected = String(phone?.id || '') === phoneId && String(waba?.id || '') === wabaId;

    return NextResponse.json({ data: {
      ...base, connected, reason: connected ? null : 'graph_access_failed',
      phoneDisplay: connected ? String(phone?.display_phone_number || '') : '',
      businessName: connected ? String(waba?.name || '') : ''
    } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'meta_diagnostics_failed' }, { status: 502 });
  }
}
