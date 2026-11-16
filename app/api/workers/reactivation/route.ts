import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { workReactivationQueue } from '@/lib/server/reactivation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const expected = process.env.ECOJOI_REACTIVATION_WORKER_TOKEN?.trim() ?? '';
  const supplied = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!/^[a-f0-9]{64}$/.test(expected)) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  if (!/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await workReactivationQueue();
    const { error } = await createAdminClient().from('whatsapp_reactivation_heartbeat')
      .upsert({ id: true, seen_at: new Date().toISOString() });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: 'reactivation_worker_failed' }, { status: 500 });
  }
}
