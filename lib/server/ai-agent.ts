import { aiTenantToken } from '@/lib/server/ai-auth';
import { postWebhook } from '@/lib/server/webhook-transport';
import { aiRequestKey } from '@/lib/server/ai-policy';
import { integrationError } from '@/lib/server/integration-policy';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordN8nExecution } from '@/lib/server/n8n';

type AgentEvent = {
  tenantId: string;
  conversationId: string;
  state: 'waiting' | 'in_service' | 'automatic';
  channel?: string | null;
  contact?: unknown;
  messages?: unknown[];
  eventName?: string;
};

async function resolveBridge(tenantId: string) {
  const admin = createAdminClient();
  try {
    const { data } = await admin
      .from('tenant_settings')
      .select('n8n_ai_enabled,n8n_webhook_url,n8n_workflow_id,ai_agent_config')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (data?.n8n_ai_enabled === true && data?.n8n_webhook_url?.trim()) {
      return {
        endpoint: data.n8n_webhook_url.trim(),
        token: process.env.N8N_WEBHOOK_TOKEN?.trim() || process.env.AI_AGENT_WEBHOOK_TOKEN?.trim() || '',
        source: 'n8n',
        workflowId: data.n8n_workflow_id?.trim() || null,
        config: data.ai_agent_config ?? {}
      };
    }

    return {
      endpoint: process.env.AI_AGENT_WEBHOOK_URL?.trim() || '',
      token: process.env.N8N_WEBHOOK_TOKEN?.trim() || process.env.AI_AGENT_WEBHOOK_TOKEN?.trim() || '',
      source: 'default',
      workflowId: null,
      config: data?.ai_agent_config ?? {}
    };
  } catch {
    return {
      endpoint: process.env.AI_AGENT_WEBHOOK_URL?.trim() || '',
      token: process.env.N8N_WEBHOOK_TOKEN?.trim() || process.env.AI_AGENT_WEBHOOK_TOKEN?.trim() || '',
      source: 'default',
      workflowId: null,
      config: {}
    };
  }
}

async function knowledgeForTenant(tenantId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('ai_knowledge_documents')
    .select('id,name,extracted_text,published_version')
    .eq('tenant_id', tenantId)
    .eq('active',true).gt('published_version',0)
    .order('created_at', { ascending: false })
    .limit(20);

  return (data ?? [])
    .filter(item => item.extracted_text)
    .map(item => ({ id:item.id,version:item.published_version,name: item.name, text: String(item.extracted_text).slice(0, 12000) }));
}

async function dispatchAiAgent(event: AgentEvent) {
  const bridge = await resolveBridge(event.tenantId);
  if (!bridge.endpoint || !bridge.token || bridge.config?.enabled===false) return { configured: false, delivered: false, source: bridge.source };

  const eventName = event.eventName ?? (event.state === 'automatic' ? 'ecojoi.crm.ai.assigned' : 'ecojoi.crm.ai.released');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, '');
  const started = Date.now();

  if (bridge.source === 'n8n') {
    await recordN8nExecution({
      tenantId: event.tenantId,
      workflowId: bridge.workflowId,
      conversationId: event.conversationId,
      eventType: eventName,
      status: 'started'
    }).catch(() => {});
  }

  try {
    const knowledge = await knowledgeForTenant(event.tenantId);
    const response = await postWebhook(bridge.endpoint,JSON.stringify({
        event:eventName,
        event_id:(event.messages as Array<{id?:string;direction?:string}>|undefined)?.filter(item=>item.direction==='inbound').at(-1)?.id??event.conversationId+':'+eventName,
        schema_version:'1.0',tenant_id:event.tenantId,conversation_id:event.conversationId,attendance_state:event.state,
        channel:event.channel??null,contact:event.contact??null,messages:event.messages??[],agent_config:bridge.config,knowledge,
        reply_url:appUrl?appUrl+'/api/ai-agent/reply':null
      }), {
        'content-type': 'application/json',
        ...(bridge.token ? { authorization: 'Bearer ' + aiTenantToken(bridge.token,event.tenantId) } : {})

    });

    if (bridge.source === 'n8n') {
      await recordN8nExecution({
        tenantId: event.tenantId,
        workflowId: bridge.workflowId,
        conversationId: event.conversationId,
        eventType: eventName,
        status: response.ok ? 'success' : 'failed',
        durationMs: Date.now() - started,
        error: response.ok ? null : `HTTP ${response.status}`
      }).catch(() => {});
    }

    return { configured: true, delivered: response.ok, source: bridge.source };
  } catch (error) {
    if (bridge.source === 'n8n') {
      await recordN8nExecution({
        tenantId: event.tenantId,
        workflowId: bridge.workflowId,
        conversationId: event.conversationId,
        eventType: eventName,
        status: 'failed',
        durationMs: Date.now() - started,
        error: integrationError(error)
      }).catch(() => {});
    }
    return { configured: true, delivered: false, source: bridge.source };
  }
}


export async function notifyAiAgent(event:AgentEvent){
 let result:{configured:boolean;delivered:boolean;source:string};
 try{result=await dispatchAiAgent(event);}catch{result={configured:false,delivered:false,source:'unavailable'};}
 if(event.state==='automatic'&&!result.delivered){
  const admin=createAdminClient();
  const last=event.messages?.at(-1) as {id?:string}|undefined;
  const {error}=await admin.rpc('crm_register_ai_decision',{
   p_tenant_id:event.tenantId,p_conversation_id:event.conversationId,
   p_event_key:aiRequestKey({tenant:event.tenantId,conversation:event.conversationId,eventId:'bridge-unavailable:'+String(last?.id??event.eventName??'assigned'),action:'escalate',body:''}),
   p_action:'escalate',p_body:null,p_reason:'ai_bridge_unavailable',p_summary:null,p_next_action:null,p_usage:{provider:'bridge'}
  });
  if(error&&!error.message?.includes('ai_conversation_not_automatic'))throw error;
 }
 return result;
}

export async function notifyAiAgentMessage(input: Omit<AgentEvent, 'state' | 'eventName'>) {
  return notifyAiAgent({
    ...input,
    state: 'automatic',
    eventName: 'ecojoi.crm.message.received'
  });
}
