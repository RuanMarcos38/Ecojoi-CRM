import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { summarizePhones } from '@/lib/crm/phone';

export async function GET(request: Request) {
  try {
    const ctx = await requirePermission('settings.manage');
    const params = new URL(request.url).searchParams;
    const offset = Number(params.get('offset') ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({ error: 'invalid_offset' }, { status: 400 });
    const client = await createClient();
    const { data, error, count } = await client.from('contacts').select('id,phone', { count: 'exact' })
      .eq('tenant_id', ctx.tenantId).order('id').range(offset, offset + 499);
    if (error) throw error;
    return NextResponse.json({ data: summarizePhones(data ?? []), offset, total: count, next_offset: offset + (data?.length ?? 0) < (count ?? 0) ? offset + 500 : null, dry_run: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'phone_diagnostics_failed' }, { status: 500 });
  }
}

