import { createAdminClient } from '@/lib/supabase/admin';
import { recordN8nExecution } from '@/lib/server/n8n';
import { getAiUsageStatus, recordAiUsage } from '@/lib/server/ai-usage';

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
      token: process.env.AI_AGENT_WEBHOOK_TOKEN?.trim() || '',
      source: 'default',
      workflowId: null,
      config: data?.ai_agent_config ?? {}
    };
  } catch {
    return {
      endpoint: process.env.AI_AGENT_WEBHOOK_URL?.trim() || '',
      token: process.env.AI_AGENT_WEBHOOK_TOKEN?.trim() || '',
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
    .select('name,extracted_text')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(20);

  return (data ?? [])
    .filter(item => item.extracted_text)
    .map(item => ({ name: item.name, text: String(item.extracted_text).slice(0, 12000) }));
}

export async function notifyAiAgent(event: AgentEvent) {
  const bridge = await resolveBridge(event.tenantId);
  if (!bridge.endpoint) return { configured: false, delivered: false, source: bridge.source };

  const usage = await getAiUsageStatus(event.tenantId).catch(() => ({ limit: 1000, used: 0, remaining: 1000, allowed: true }));
  if (!usage.allowed) {
    await recordAiUsage({
      tenantId: event.tenantId,
      conversationId: event.conversationId,
      provider: bridge.source,
      eventType: 'quota_blocked',
      success: false,
      error: 'daily_ai_limit_reached',
      metadata: { limit: usage.limit, used: usage.used }
    }).catch(() => {});
    return { configured: true, delivered: false, source: bridge.source, quotaExceeded: true };
  }

  const eventName = event.eventName ?? (event.state === 'automatic' ? 'ecojoi.crm.ai.assigned' : 'ecojoi.crm.ai.released');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
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
    const response = await fetch(bridge.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(bridge.token ? { authorization: 'Bearer ' + bridge.token } : {})
      },
      body: JSON.stringify({
        event: eventName,
        tenant_id: event.tenantId,
        conversation_id: event.conversationId,
        attendance_state: event.state,
        channel: event.channel ?? null,
        contact: event.contact ?? null,
        messages: event.messages ?? [],
        agent_config: bridge.config,
        knowledge,
        reply_url: appUrl ? appUrl + '/api/ai-agent/reply' : null
      }),
      cache: 'no-store',
      signal: controller.signal
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

    await recordAiUsage({
      tenantId: event.tenantId,
      conversationId: event.conversationId,
      provider: bridge.source,
      eventType: eventName,
      latencyMs: Date.now() - started,
      success: response.ok,
      error: response.ok ? null : `HTTP ${response.status}`,
      metadata: { workflow_id: bridge.workflowId, channel: event.channel ?? null }
    }).catch(() => {});

    return { configured: true, delivered: response.ok, source: bridge.source, quotaExceeded: false };
  } catch (error) {
    if (bridge.source === 'n8n') {
      await recordN8nExecution({
        tenantId: event.tenantId,
        workflowId: bridge.workflowId,
        conversationId: event.conversationId,
        eventType: eventName,
        status: 'failed',
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : 'n8n_webhook_failed'
      }).catch(() => {});
    }
    await recordAiUsage({
      tenantId: event.tenantId,
      conversationId: event.conversationId,
      provider: bridge.source,
      eventType: eventName,
      latencyMs: Date.now() - started,
      success: false,
      error: error instanceof Error ? error.message : 'ai_bridge_failed',
      metadata: { workflow_id: bridge.workflowId, channel: event.channel ?? null }
    }).catch(() => {});
    return { configured: true, delivered: false, source: bridge.source, quotaExceeded: false };
  } finally {
    clearTimeout(timeout);
  }
}

export async function notifyAiAgentMessage(input: Omit<AgentEvent, 'state' | 'eventName'>) {
  return notifyAiAgent({
    ...input,
    state: 'automatic',
    eventName: 'ecojoi.crm.message.received'
  });
}
