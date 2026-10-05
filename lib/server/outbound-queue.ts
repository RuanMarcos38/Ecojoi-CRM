import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppText, sendWhatsAppTemplate, sendWhatsAppMedia, isWhatsAppWindowOpen } from '@/lib/server/meta';
import { integrationError, retryDelayMs } from '@/lib/server/integration-policy';
const BUCKET='ecojoi-message-attachments';
type QueuePayload = (
 | {kind:'text';to:string;body:string}
 | {kind:'template';to:string;name:string;language?:string;components?:unknown[]}
 | {kind:'media';to:string;storagePath:string;fileName:string;mime:string;caption?:string|null}
) & {actor?:'ai'|'human'|'api';actorUserId?:string};
export async function enqueueOutbound(input:{tenantId:string;conversationId:string;messageId?:string|null;channel:string;payload:QueuePayload;error?:string|null}){
 const admin=createAdminClient();
 const {data,error}=await admin.from('outbound_message_queue').insert({
  tenant_id:input.tenantId,conversation_id:input.conversationId,message_id:input.messageId??null,channel:input.channel,
  payload:input.payload,status:'pending',attempts:0,max_attempts:5,next_attempt_at:new Date().toISOString(),
  last_error:input.error?integrationError(new Error(input.error)):null
 }).select('id').single();
 if(error)throw error;return data.id as string;
}
async function deliverWhatsApp(tenantId:string,payload:QueuePayload){
 if(payload.kind==='text')return sendWhatsAppText(tenantId,payload.to,payload.body);
 if(payload.kind==='template')return sendWhatsAppTemplate(tenantId,payload.to,payload.name,payload.language??'pt_BR',payload.components??[]);
 const admin=createAdminClient();
 const {data,error}=await admin.storage.from(BUCKET).download(payload.storagePath);
 if(error||!data)return {delivered:false as const,reason:'queued_media_not_found'};
 return sendWhatsAppMedia(tenantId,payload.to,new File([await data.arrayBuffer()],payload.fileName,{type:payload.mime}),payload.caption??null);
}
export async function processOutboundQueue(limit=20,tenantId?:string){
 const admin=createAdminClient();
 const {data:jobs,error}=await admin.rpc('crm_claim_outbound_messages',{p_limit:Math.min(100,Math.max(1,limit)),p_tenant_id:tenantId??null});
 if(error)throw error;let sent=0,failed=0,dead=0;
 for(const job of jobs??[]){
  let providerAccepted=false,reason:string|null=null,providerId:string|null=null;
  let cancel=false;
  try{
   const payload=job.payload as QueuePayload;
   if(job.channel==='whatsapp'){
    const {data:conversation,error:readError}=await admin.from('conversations')
      .select('status,attendance_state,assigned_to,last_inbound_at').eq('tenant_id',job.tenant_id).eq('id',job.conversation_id).maybeSingle();
    if(readError)throw readError;
    if(!conversation||conversation.status==='closed'){cancel=true;reason='conversation_closed';}
    else if(payload.actor==='ai'&&conversation.attendance_state!=='automatic'){cancel=true;reason='ai_human_takeover';}
    else if(payload.actor==='human'&&(conversation.attendance_state!=='in_service'||conversation.assigned_to!==payload.actorUserId)){cancel=true;reason='conversation_owner_changed';}
    else if(payload.actor==='api'&&conversation.attendance_state!=='in_service'){cancel=true;reason='conversation_not_in_human_service';}
    else if(payload.kind!=='template'&&!isWhatsAppWindowOpen(conversation.last_inbound_at)){cancel=true;reason='whatsapp_window_closed';}
   }
   if(!cancel){
    const result=job.channel==='whatsapp'?await deliverWhatsApp(job.tenant_id,payload):{delivered:false as const,reason:'unsupported_channel'};
    providerAccepted=result.delivered;
    if(result.delivered)providerId=result.providerMessageId??null;
    else {
     reason=['not_configured','unsupported_channel','queued_media_not_found','meta_provider_rejected'].includes(result.reason??'')?result.reason!:integrationError(new Error(result.reason??'delivery_failed'));
     cancel=['integration_timeout','integration_request_failed'].includes(reason);
    }
   }
  }catch(e){reason=integrationError(e);}
  // External sends cannot be rolled back. Completion and message status share one DB transaction.
  if(providerAccepted){
   const {data:completed,error:completionError}=await admin.rpc('crm_complete_outbound_message',{
    p_tenant_id:job.tenant_id,p_job_id:job.id,p_lease_token:job.lease_token,p_provider_message_id:providerId
   });
   if(!completionError){if(completed)sent++;continue;}
   // Do not resend an acknowledged message when its DB acknowledgement failed.
   reason='provider_accepted_reconciliation_required';cancel=true;
  }
  const isDead=cancel||job.attempts>=job.max_attempts;
  const {data:updated,error:writeError}=await admin.from('outbound_message_queue').update({
   status:isDead?'dead_letter':'failed',last_error:reason,locked_at:null,
   next_attempt_at:new Date(Date.now()+retryDelayMs(job.attempts)).toISOString(),updated_at:new Date().toISOString()
  }).eq('id',job.id).eq('tenant_id',job.tenant_id).eq('lease_token',job.lease_token).select('id').maybeSingle();
  if(writeError)throw writeError;if(!updated)continue;
  if(isDead&&job.message_id){
   const {error:messageError}=await admin.from('messages').update({status:'failed'}).eq('tenant_id',job.tenant_id).eq('id',job.message_id).eq('status','queued');
   if(messageError)throw messageError;
  }
  if(isDead&&(job.payload as QueuePayload).actor==='ai'){
   const {error:handoffError}=await admin.rpc('crm_register_ai_decision',{
    p_tenant_id:job.tenant_id,p_conversation_id:job.conversation_id,p_event_key:'outbound-failed:'+job.id,
    p_action:'escalate',p_body:null,p_reason:'ai_delivery_failed',p_usage:{provider:'delivery'}
   });
   if(handoffError&&!handoffError.message?.includes('ai_conversation_not_automatic'))throw handoffError;
  }
  if(isDead)dead++;else failed++;
 }
 return {processed:(jobs??[]).length,sent,failed,dead};
}

