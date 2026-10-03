import { verifyAiAuthorization } from '@/lib/server/ai-auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { isWhatsAppWindowOpen } from '@/lib/server/meta';
import { aiDecision,aiReplySchema,aiRequestKey } from '@/lib/server/ai-policy';
export async function POST(req:Request){
 try{
  const expected=process.env.N8N_WEBHOOK_TOKEN?.trim()||process.env.AI_AGENT_WEBHOOK_TOKEN?.trim();
  if(!expected)return NextResponse.json({error:'ai_agent_not_configured'},{status:503});
  const input=aiReplySchema.parse(await req.json());
  if(!verifyAiAuthorization(req.headers.get('authorization'),expected,input.tenant_id,process.env.AI_AGENT_LEGACY_TENANT_ID?.trim()))return NextResponse.json({error:'unauthorized'},{status:401});
  const client=createAdminClient();
  const {data:conversation,error}=await client.from('conversations').select('id,channel,attendance_state,last_inbound_at').eq('id',input.conversation_id).eq('tenant_id',input.tenant_id).maybeSingle();
  if(error)throw error;if(!conversation)return NextResponse.json({error:'not_found'},{status:404});
  const {data:settings,error:settingsError}=await client.from('tenant_settings').select('ai_agent_config,n8n_ai_enabled').eq('tenant_id',input.tenant_id).maybeSingle();
  if(settingsError)throw settingsError;
  if(settings?.ai_agent_config?.enabled===false)return NextResponse.json({error:'ai_disabled_for_tenant'},{status:409});
  const decision=aiDecision(input,Number(settings?.ai_agent_config?.confidence_handoff??0.7));
  if(decision.action!=='escalate'&&conversation.channel==='whatsapp'&&!isWhatsAppWindowOpen(conversation.last_inbound_at))return NextResponse.json({error:'whatsapp_window_closed',template_required:true},{status:409});
  const eventId=req.headers.get('idempotency-key')||input.event_id||input.usage?.request_id;
  if(eventId&&eventId.length>200)return NextResponse.json({error:'invalid_idempotency_key'},{status:400});
  const key=aiRequestKey({tenant:input.tenant_id,conversation:input.conversation_id,eventId,lastInbound:conversation.last_inbound_at,action:decision.action,body:decision.body});
  const {data,error:writeError}=await client.rpc('crm_register_ai_decision',{
   p_tenant_id:input.tenant_id,p_conversation_id:input.conversation_id,p_event_key:key,p_action:decision.action,
   p_body:decision.body??null,p_reason:decision.reason,p_summary:input.summary??null,p_next_action:input.next_action??null,p_usage:input.usage??{}
  });
  if(writeError){
   if(writeError.message?.includes('ai_conversation_not_automatic'))return NextResponse.json({error:'conversation_not_in_automatic_mode'},{status:409});
   if(writeError.message?.includes('ai_unsupported_channel'))return NextResponse.json({error:'ai_unsupported_channel'},{status:409});
   throw writeError;
  }
  return NextResponse.json(data,{status:data?.duplicate?200:201,headers:{'Cache-Control':'no-store'}});
 }catch(e){
  if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
  return NextResponse.json({error:'ai_agent_reply_failed'},{status:500});
 }
}

