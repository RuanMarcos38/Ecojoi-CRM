import { createHmac } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

function delayMinutes(attempt:number){return Math.min(60,Math.max(1,2**Math.max(0,attempt)));}

export async function processWebhookDeliveries(limit=25,tenantId?:string){
  const admin=createAdminClient();
  let query=admin.from('webhook_deliveries')
    .select('id,tenant_id,subscription_id,event_type,entity_id,payload,status,attempts,max_attempts,subscription:webhook_subscriptions(id,endpoint_url,active)')
    .in('status',['pending','failed'])
    .lte('next_attempt_at',new Date().toISOString())
    .order('next_attempt_at',{ascending:true})
    .limit(Math.min(100,Math.max(1,limit)));
  if(tenantId)query=query.eq('tenant_id',tenantId);
  const {data,error}=await query;
  if(error)throw error;

  let sent=0,failed=0,dead=0;
  for(const item of data??[]){
    const sub=Array.isArray(item.subscription)?item.subscription[0]:item.subscription;
    if(!sub?.active||!sub.endpoint_url)continue;

    const {data:secret}=await admin.from('webhook_secrets')
      .select('signing_key').eq('subscription_id',item.subscription_id).eq('tenant_id',item.tenant_id).maybeSingle();

    const body=JSON.stringify({event:item.event_type,entity_id:item.entity_id,payload:item.payload,delivered_at:new Date().toISOString()});
    const signature=secret?.signing_key?createHmac('sha256',String(secret.signing_key)).update(body).digest('hex'):null;

    try{
      const response=await fetch(String(sub.endpoint_url),{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'user-agent':'Ecojoi-CRM-Webhooks/1.0',
          'x-ecojoi-event':item.event_type,
          'x-ecojoi-delivery':item.id,
          ...(signature?{'x-ecojoi-signature':`sha256=${signature}`}:{})
        },
        body,cache:'no-store',signal:AbortSignal.timeout(12000)
      });

      if(response.ok){
        await admin.from('webhook_deliveries').update({
          status:'sent',response_status:response.status,error:null,delivered_at:new Date().toISOString()
        }).eq('id',item.id);
        await admin.from('webhook_subscriptions').update({
          last_status:response.status,last_delivery_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()
        }).eq('id',item.subscription_id);
        sent++;continue;
      }

      const attempts=Number(item.attempts??0)+1;
      const isDead=attempts>=Number(item.max_attempts??5);
      await admin.from('webhook_deliveries').update({
        status:isDead?'dead_letter':'failed',
        attempts,response_status:response.status,error:`HTTP ${response.status}`,
        next_attempt_at:new Date(Date.now()+delayMinutes(attempts)*60000).toISOString()
      }).eq('id',item.id);
      await admin.from('webhook_subscriptions').update({
        last_status:response.status,last_error:`HTTP ${response.status}`,updated_at:new Date().toISOString()
      }).eq('id',item.subscription_id);
      if(isDead)dead++;else failed++;
    }catch(e){
      const attempts=Number(item.attempts??0)+1;
      const isDead=attempts>=Number(item.max_attempts??5);
      const message=e instanceof Error?e.message.slice(0,500):'webhook_delivery_failed';
      await admin.from('webhook_deliveries').update({
        status:isDead?'dead_letter':'failed',attempts,error:message,
        next_attempt_at:new Date(Date.now()+delayMinutes(attempts)*60000).toISOString()
      }).eq('id',item.id);
      await admin.from('webhook_subscriptions').update({last_error:message,updated_at:new Date().toISOString()}).eq('id',item.subscription_id);
      if(isDead)dead++;else failed++;
    }
  }
  return {processed:(data??[]).length,sent,failed,dead};
}
