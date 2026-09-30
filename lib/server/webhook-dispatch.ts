import { createHmac,createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

function masterSecret(){
  return process.env.WEBHOOK_MASTER_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
}
export function webhookSigningSecret(subscriptionId:string){
  const master=masterSecret();
  if(!master) return '';
  return 'whsec_'+createHmac('sha256',master).update('ecojoi-webhook:'+subscriptionId).digest('base64url');
}
export function webhookSecretHash(subscriptionId:string){
  const secret=webhookSigningSecret(subscriptionId);
  return secret?createHash('sha256').update(secret).digest('hex'):null;
}

async function deliverJob(job:any,subscription:any){
  const admin=createAdminClient();
  const body=JSON.stringify({id:job.id,event:job.event_type,entity_id:job.entity_id,created_at:job.created_at,data:job.payload});
  const secret=webhookSigningSecret(subscription.id);
  const signature=secret?createHmac('sha256',secret).update(body).digest('hex'):'';
  const started=Date.now();
  try{
    const response=await fetch(subscription.endpoint_url,{
      method:'POST',
      headers:{'content-type':'application/json','user-agent':'Ecojoi-CRM-Webhook/1.0',...(signature?{'x-ecojoi-signature':'sha256='+signature}:{})},
      body,cache:'no-store',signal:AbortSignal.timeout(8000)
    });
    const ok=response.ok;
    const attempts=Number(job.attempts||0)+1;
    await admin.from('webhook_delivery_jobs').update({
      status:ok?'sent':attempts>=5?'dead_letter':'failed',
      attempts,
      next_attempt_at:new Date(Date.now()+Math.min(3600000,Math.pow(2,attempts)*30000)).toISOString(),
      last_error:ok?null:`HTTP ${response.status}`,
      completed_at:ok?new Date().toISOString():null
    }).eq('id',job.id);
    await admin.from('webhook_subscriptions').update({last_status:response.status,last_delivery_at:new Date().toISOString(),last_error:ok?null:`HTTP ${response.status}`}).eq('id',subscription.id);
    await admin.from('webhook_deliveries').insert({tenant_id:job.tenant_id,subscription_id:subscription.id,event_type:job.event_type,entity_id:job.entity_id,payload:job.payload,status:ok?'sent':'failed',attempts:1,response_status:response.status,error:ok?null:`HTTP ${response.status}`,delivered_at:ok?new Date().toISOString():null});
    return {ok,status:response.status,duration_ms:Date.now()-started};
  }catch(error){
    const attempts=Number(job.attempts||0)+1;
    const message=error instanceof Error?error.message:'delivery_failed';
    await admin.from('webhook_delivery_jobs').update({status:attempts>=5?'dead_letter':'failed',attempts,next_attempt_at:new Date(Date.now()+Math.min(3600000,Math.pow(2,attempts)*30000)).toISOString(),last_error:message}).eq('id',job.id);
    await admin.from('webhook_subscriptions').update({last_error:message}).eq('id',subscription.id);
    return {ok:false,status:null,duration_ms:Date.now()-started};
  }
}

export async function emitWebhookEvent(tenantId:string,eventType:string,entityId:string|null,payload:Record<string,unknown>){
  const admin=createAdminClient();
  const {data:subscriptions,error}=await admin.from('webhook_subscriptions').select('id,endpoint_url,events,active').eq('tenant_id',tenantId).eq('active',true);
  if(error||!subscriptions?.length)return {queued:0,delivered:0};
  const selected=subscriptions.filter(s=>Array.isArray(s.events)&&(s.events.includes(eventType)||s.events.includes('*')));
  if(!selected.length)return {queued:0,delivered:0};
  const {data:jobs,error:jobError}=await admin.from('webhook_delivery_jobs').insert(selected.map(s=>({tenant_id:tenantId,subscription_id:s.id,event_type:eventType,entity_id:entityId,payload,status:'processing',attempts:0}))).select('*');
  if(jobError||!jobs)return {queued:0,delivered:0};
  let delivered=0;
  for(const job of jobs){
    const subscription=selected.find(s=>s.id===job.subscription_id);
    if(subscription&&(await deliverJob(job,subscription)).ok) delivered++;
  }
  return {queued:jobs.length,delivered};
}

export async function retryWebhookJobs(tenantId:string,limit=25){
  const admin=createAdminClient();
  const {data:jobs}=await admin.from('webhook_delivery_jobs').select('*').eq('tenant_id',tenantId).in('status',['pending','failed']).lte('next_attempt_at',new Date().toISOString()).order('created_at').limit(limit);
  let sent=0,failed=0;
  for(const job of jobs??[]){
    const {data:sub}=await admin.from('webhook_subscriptions').select('id,endpoint_url,events,active').eq('tenant_id',tenantId).eq('id',job.subscription_id).maybeSingle();
    if(!sub?.active)continue;
    const result=await deliverJob({...job,status:'processing'},sub); if(result.ok)sent++; else failed++;
  }
  return {processed:(jobs??[]).length,sent,failed};
}
