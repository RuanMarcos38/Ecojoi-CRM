import { createAdminClient } from '@/lib/supabase/admin';
import { processOutboundQueue } from '@/lib/server/outbound-queue';
import { processSalesSequences } from '@/lib/server/sequence-worker';
import { processWebhookDeliveries } from '@/lib/server/webhook-worker';
import { cleanupExpiredAttachments } from '@/lib/server/retention';

export async function runOperationalWorkers(tenantId?:string){
  const admin=createAdminClient();
  const started=Date.now();
  const runId=crypto.randomUUID();
  await admin.from('worker_runs').insert({
    id:runId,tenant_id:tenantId??null,worker_name:'operational_tick',status:'started'
  });

  try{
    const [queue,sequences,webhooks,retention]=await Promise.all([
      processOutboundQueue(50,tenantId),
      processSalesSequences(50,tenantId),
      processWebhookDeliveries(50,tenantId),
      cleanupExpiredAttachments(tenantId,50)
    ]);
    const processed=Number(queue.processed??0)+Number(sequences.processed??0)+Number(webhooks.processed??0)+Number(retention.inspected??0);
    const succeeded=Number(queue.sent??0)+Number(sequences.succeeded??0)+Number(webhooks.sent??0)+Number(retention.removed??0);
    const failed=Number(queue.failed??0)+Number(queue.dead??0)+Number(sequences.failed??0)+Number(webhooks.failed??0)+Number(webhooks.dead??0)+Number(retention.failed??0);
    await admin.from('worker_runs').update({
      status:'success',processed,succeeded,failed,duration_ms:Date.now()-started,
      metadata:{queue,sequences,webhooks,retention}
    }).eq('id',runId);
    return {queue,sequences,webhooks,retention,processed,succeeded,failed,duration_ms:Date.now()-started};
  }catch(e){
    const message=e instanceof Error?e.message.slice(0,1000):'worker_tick_failed';
    await admin.from('worker_runs').update({status:'failed',duration_ms:Date.now()-started,error:message}).eq('id',runId);
    throw e;
  }
}
