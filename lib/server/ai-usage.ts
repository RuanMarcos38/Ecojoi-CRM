import { createAdminClient } from '@/lib/supabase/admin';

export async function getAiUsageStatus(tenantId:string){
  const admin=createAdminClient();
  const [{data:settings},{data:used,error}]=await Promise.all([
    admin.from('tenant_settings').select('ai_daily_message_limit').eq('tenant_id',tenantId).maybeSingle(),
    admin.rpc('ai_daily_usage',{p_tenant_id:tenantId})
  ]);
  const limit=Math.max(0,Number(settings?.ai_daily_message_limit??1000));
  const count=error?0:Number(used??0);
  return {limit,used:count,remaining:limit===0?0:Math.max(0,limit-count),allowed:limit===0?false:count<limit};
}

export async function recordAiUsage(input:{
  tenantId:string;
  conversationId?:string|null;
  provider?:string;
  model?:string|null;
  eventType:string;
  inputTokens?:number;
  outputTokens?:number;
  estimatedCost?:number;
  latencyMs?:number|null;
  success?:boolean;
  error?:string|null;
  metadata?:Record<string,unknown>;
}){
  const admin=createAdminClient();
  await admin.from('ai_usage_logs').insert({
    tenant_id:input.tenantId,
    conversation_id:input.conversationId??null,
    provider:input.provider??'n8n',
    model:input.model??null,
    event_type:input.eventType,
    input_tokens:Math.max(0,Math.round(input.inputTokens??0)),
    output_tokens:Math.max(0,Math.round(input.outputTokens??0)),
    estimated_cost:Math.max(0,Number(input.estimatedCost??0)),
    latency_ms:input.latencyMs??null,
    success:input.success!==false,
    error:input.error??null,
    metadata:input.metadata??{}
  });
}
