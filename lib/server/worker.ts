import { createAdminClient } from '@/lib/supabase/admin';
import { processOutboundQueue } from '@/lib/server/outbound-queue';
import { processSalesSequences } from '@/lib/server/sequence-worker';
import { processWebhookDeliveries } from '@/lib/server/webhook-worker';
import { cleanupExpiredAttachments } from '@/lib/server/retention';
import { recalculateLeadScores } from '@/lib/server/scoring';

import { processMetaInbox } from '@/lib/server/meta-inbox';

export async function runOperationalWorkers(tenantId?:string){
  const admin=createAdminClient();
  const started=Date.now();
  const runId=crypto.randomUUID();
  await admin.from('worker_runs').insert({
    id:runId,tenant_id:tenantId??null,worker_name:'operational_tick',status:'started'
  });

  try{
    const [inbox,queue,sequences,webhooks,retention,scoring]=await Promise.all([
      processMetaInbox(25,tenantId),
      processOutboundQueue(50,tenantId),
      processSalesSequences(50,tenantId),
      processWebhookDeliveries(50,tenantId),
      cleanupExpiredAttachments(tenantId,50),
      recalculateLeadScores(tenantId,200)
    ]);
    const processed=Number(inbox.processed??0)+Number(queue.processed??0)+Number(sequences.processed??0)+Number(webhooks.processed??0)+Number(retention.inspected??0)+Number(scoring.processed??0);
    const succeeded=Number(inbox.succeeded??0)+Number(queue.sent??0)+Number(sequences.succeeded??0)+Number(webhooks.sent??0)+Number(retention.removed??0)+Number(scoring.succeeded??0);
    const failed=Number(inbox.failed??0)+Number(inbox.dead??0)+Number(queue.failed??0)+Number(queue.dead??0)+Number(sequences.failed??0)+Number(webhooks.failed??0)+Number(webhooks.dead??0)+Number(retention.failed??0)+Number(scoring.failed??0);
    await admin.from('worker_runs').update({
      status:'success',processed,succeeded,failed,duration_ms:Date.now()-started,
      metadata:{inbox,queue,sequences,webhooks,retention,scoring}
    }).eq('id',runId);
    return {inbox,queue,sequences,webhooks,retention,scoring,processed,succeeded,failed,duration_ms:Date.now()-started};
  }catch(e){
    const message=e instanceof Error?e.message.slice(0,1000):'worker_tick_failed';
    await admin.from('worker_runs').update({status:'failed',duration_ms:Date.now()-started,error:message}).eq('id',runId);
    throw e;
  }
}
