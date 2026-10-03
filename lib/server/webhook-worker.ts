import { createAdminClient } from '@/lib/supabase/admin';
import { integrationError,retryDelayMs,webhookEnvelope,webhookHeaders } from '@/lib/server/integration-policy';
import { postWebhook } from '@/lib/server/webhook-transport';
export async function processWebhookDeliveries(limit=25,tenantId?:string){
 const admin=createAdminClient();
 const {data,error}=await admin.rpc('crm_claim_webhook_deliveries',{p_limit:Math.min(100,Math.max(1,limit)),p_tenant_id:tenantId??null});
 if(error)throw error;
 let sent=0,failed=0,dead=0;
 for(const item of data??[]){
  const started=Date.now();let responseStatus:number|null=null,failure:string|null=null,delivered=false;
  try{
   const {data:sub,error:subError}=await admin.from('webhook_subscriptions').select('endpoint_url,active').eq('tenant_id',item.tenant_id).eq('id',item.subscription_id).maybeSingle();
   if(subError)throw subError;
   if(!sub?.active){
    const {error:e}=await admin.from('webhook_deliveries').update({status:'ignored',locked_at:null,error:'subscription_inactive'}).eq('id',item.id).eq('lease_token',item.lease_token);
    if(e)throw e;continue;
   }
   const {data:secret,error:secretError}=await admin.from('webhook_secrets').select('signing_key').eq('subscription_id',item.subscription_id).eq('tenant_id',item.tenant_id).maybeSingle();
   if(secretError)throw secretError;if(!secret?.signing_key)throw new Error('signing_key_unavailable');
   const body=JSON.stringify(webhookEnvelope(item,new Date().toISOString()));
   const result=await postWebhook(sub.endpoint_url,body,webhookHeaders(body,secret.signing_key,item.id,item.event_type,String(Math.floor(Date.now()/1000))));
   responseStatus=result.status;delivered=result.ok;if(!delivered)failure='HTTP '+result.status;
  }catch(e){failure=integrationError(e);}
  const isDead=!delivered&&item.attempts>=item.max_attempts;
  const {data:finished,error:updateError}=await admin.from('webhook_deliveries').update({
   status:delivered?'sent':isDead?'dead_letter':'failed',response_status:responseStatus,error:failure,locked_at:null,
   duration_ms:Date.now()-started,delivered_at:delivered?new Date().toISOString():null,
   next_attempt_at:new Date(Date.now()+retryDelayMs(item.attempts)).toISOString()
  }).eq('id',item.id).eq('tenant_id',item.tenant_id).eq('lease_token',item.lease_token).select('id').maybeSingle();
  if(updateError)throw updateError;if(!finished)continue;
  const {error:e}=await admin.from('webhook_subscriptions').update({last_status:responseStatus,last_error:failure,
   ...(delivered?{last_delivery_at:new Date().toISOString()}:{}),updated_at:new Date().toISOString()
  }).eq('id',item.subscription_id).eq('tenant_id',item.tenant_id);
  if(e)throw e;if(delivered)sent++;else if(isDead)dead++;else failed++;
 }
 return {processed:(data??[]).length,sent,failed,dead};
}

