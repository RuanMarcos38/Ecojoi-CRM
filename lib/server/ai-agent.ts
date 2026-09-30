import { createAdminClient } from '@/lib/supabase/admin';

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
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('tenant_settings')
      .select('n8n_ai_enabled,n8n_webhook_url')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (data?.n8n_ai_enabled === true && data?.n8n_webhook_url?.trim()) {
      return {
        endpoint: data.n8n_webhook_url.trim(),
        token: process.env.N8N_WEBHOOK_TOKEN?.trim() || process.env.AI_AGENT_WEBHOOK_TOKEN?.trim() || '',
        source: 'n8n'
      };
    }
  } catch {
    // Preserve the existing AI bridge when tenant-specific n8n settings are unavailable.
  }

  return {
    endpoint: process.env.AI_AGENT_WEBHOOK_URL?.trim() || '',
    token: process.env.AI_AGENT_WEBHOOK_TOKEN?.trim() || '',
    source: 'default'
  };
}

export async function notifyAiAgent(event: AgentEvent) {
  const bridge = await resolveBridge(event.tenantId);
  if (!bridge.endpoint) return { configured: false, delivered: false, source: bridge.source };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(bridge.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(bridge.token ? { authorization: 'Bearer ' + bridge.token } : {})
      },
      body: JSON.stringify({
        event: event.eventName ?? (event.state === 'automatic' ? 'ecojoi.crm.ai.assigned' : 'ecojoi.crm.ai.released'),
        tenant_id: event.tenantId,
        conversation_id: event.conversationId,
        attendance_state: event.state,
        channel: event.channel ?? null,
        contact: event.contact ?? null,
        messages: event.messages ?? [],
        reply_url: appUrl ? appUrl + '/api/ai-agent/reply' : null
      }),
      cache: 'no-store',
      signal: controller.signal
    });

    return { configured: true, delivered: response.ok, source: bridge.source };
  } catch {
    return { configured: true, delivered: false, source: bridge.source };
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
