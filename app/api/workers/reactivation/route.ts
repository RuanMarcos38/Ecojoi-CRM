import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanupExpiredAttachments } from '@/lib/server/retention';
import { enqueueLeadFollowUps, workReactivationQueue } from '@/lib/server/reactivation';

import { reconcileRecentEvolutionMessages } from '@/lib/server/evolution';
import { processOutboundQueue, queuePipelineMessages } from '@/lib/server/outbound-queue';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const expected = process.env.ECOJOI_REACTIVATION_WORKER_TOKEN?.trim() ?? '';
  const supplied = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!/^[a-f0-9]{64}$/.test(expected)) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  if (!/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    await enqueueLeadFollowUps().catch(() => {});
    const data = await workReactivationQueue();
    const { error } = await createAdminClient().from('whatsapp_reactivation_heartbeat')
      .upsert({ id: true, seen_at: new Date().toISOString() });
    if (error) throw error;
    const pipeline = await queuePipelineMessages()
      .then(async staged => ({ ...staged, delivery: await processOutboundQueue(10, undefined, true) }))
      .catch(() => ({ error: 'pipeline_queue_failed' }));
    const whatsappHistory = await reconcileRecentEvolutionMessages().catch(() => ({ error: 'evolution_history_failed' }));
    const retention = await cleanupExpiredAttachments(undefined, 10, true)
      .catch(() => ({ error: 'attachment_retention_failed' }));
    return NextResponse.json({ data, pipeline, whatsappHistory, retention });
  } catch {
    return NextResponse.json({ error: 'reactivation_worker_failed' }, { status: 500 });
  }
}
