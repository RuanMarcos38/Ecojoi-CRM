import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function canInspectRevision(request: Request) {
  const expected = process.env.ECOJOI_HEALTH_PROBE_TOKEN;
  const supplied = request.headers.get('x-ecojoi-health-probe');
  if (!expected || !supplied) return false;

  const candidate = Buffer.from(supplied);
  const secret = Buffer.from(expected);
  return candidate.length === secret.length && timingSafeEqual(candidate, secret);
}

export async function GET(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('tenants').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) throw error;

    const revision = process.env.ECOJOI_RUNNING_REVISION;
    const data = revision && canInspectRevision(request) ? { status: 'ok', revision } : { status: 'ok' };
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ status: 'degraded' }, { status: 503, headers });
  }
}
