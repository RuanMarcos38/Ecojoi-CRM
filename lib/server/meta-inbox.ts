import { createAdminClient } from '@/lib/supabase/admin';
import { processMetaWebhook, tenantByMetaAsset } from '@/lib/server/meta';
import { integrationError, retryDelayMs } from '@/lib/server/integration-policy';
import { createHash } from 'node:crypto';

type MetaEvent = { tenantId: string; key: string; type: string; payload: unknown };
export async function enqueueMetaWebhook(payload: any) {
 const events:MetaEvent[]=[];
 const object=String(payload?.object??'');
 for(const entry of payload?.entry??[]){
  if(object==='whatsapp_business_account'){
   for(const change of entry?.changes??[]){
    if(change?.field!=='messages')continue;
    const value=change.value;
    const tenantId=await tenantByMetaAsset('meta_phone_number_id',value?.metadata?.phone_number_id);
    if(!tenantId)continue;
    for(const message of value?.messages??[]){
     if(!message?.id||!message?.from)continue;
     events.push({tenantId,key:message.id,type:'whatsapp_message',payload:{object,entry:[{changes:[{field:'messages',value:{metadata:value.metadata,messages:[message],contacts:value.contacts??[]}}]}]}});
    }
    for(const status of value?.statuses??[]){
     if(!status?.id||!['sent','delivered','read','failed'].includes(status.status))continue;
     const key='status:'+createHash('sha256').update(JSON.stringify([status.id,status.status,status.timestamp??null])).digest('hex');
     events.push({tenantId,key,type:'whatsapp_status',payload:{object,entry:[{changes:[{field:'messages',value:{metadata:value.metadata,statuses:[status]}}]}]}});
    }
   }
  }else if(object==='page'||object==='instagram'){
   const tenantId=await tenantByMetaAsset(object==='page'?'meta_page_id':'meta_instagram_account_id',entry?.id);
   if(!tenantId)continue;
   for(const event of entry?.messaging??[]){
    if(!event?.message?.mid||!event?.sender?.id||event.message.is_echo)continue;
    events.push({tenantId,key:event.message.mid,type:object+'_message',payload:{object,entry:[{id:entry.id,messaging:[event]}]}});
   }
   if(object==='page')for(const change of entry?.changes??[]){
    if(change?.field!=='leadgen'||!change.value?.leadgen_id)continue;
    events.push({tenantId,key:String(change.value.leadgen_id),type:'meta_leadgen',payload:{object,entry:[{id:entry.id,changes:[change]}]}});
   }
  }
 }
 const admin=createAdminClient();let queued=0;
 for(const event of events){
  const {data,error}=await admin.from('integration_events').upsert({
   tenant_id:event.tenantId,provider:'meta',event_key:event.key,event_type:event.type,
   payload_meta:{schema_version:'1.0'},inbound_payload:event.payload,processing_status:'pending'
  },{onConflict:'tenant_id,provider,event_key',ignoreDuplicates:true}).select('id');
  if(error)throw error;queued+=data?.length??0;
 }
 return {queued,inspected:events.length};
}
export async function processMetaInbox(limit=25,tenantId?:string){
 const admin=createAdminClient();
 const {data:jobs,error}=await admin.rpc('crm_claim_meta_events',{p_limit:Math.min(50,Math.max(1,limit)),p_tenant_id:tenantId??null});
 if(error)throw error;let succeeded=0,failed=0,dead=0;
 for(const job of jobs??[]){
  let failure:string|null=null;
  try{await processMetaWebhook(job.inbound_payload,job.tenant_id);}catch(e){
   failure=e instanceof Response&&[400,409].includes(e.status)?'identity_manual_review_required':integrationError(e);
  }
  const isDead=!!failure&&(failure==='identity_manual_review_required'||job.attempts>=job.max_attempts);
  const {data:finished,error:writeError}=await admin.from('integration_events').update({
   processing_status:failure?(isDead?'dead_letter':'failed'):'completed',last_error:failure,locked_at:null,
   next_attempt_at:new Date(Date.now()+retryDelayMs(job.attempts)).toISOString(),
   processed_at:failure?null:new Date().toISOString()
  }).eq('id',job.id).eq('tenant_id',job.tenant_id).eq('lease_token',job.lease_token).select('id').maybeSingle();
  if(writeError)throw writeError;if(!finished)continue;
  if(!failure)succeeded++;else if(isDead)dead++;else failed++;
 }
 return {processed:(jobs??[]).length,succeeded,failed,dead};
}

