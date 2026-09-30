type AgentEvent = {
  tenantId: string;
  conversationId: string;
  state: 'waiting' | 'in_service' | 'automatic';
  channel?: string | null;
  contact?: unknown;
  messages?: unknown[];
};

export async function notifyAiAgent(event: AgentEvent) {
  const endpoint = process.env.AI_AGENT_WEBHOOK_URL?.trim();
  if (!endpoint) return { configured: false, delivered: false };

  const token = process.env.AI_AGENT_WEBHOOK_TOKEN?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {})
      },
      body: JSON.stringify({
        event: event.state === 'automatic' ? 'ecojoi.crm.ai.assigned' : 'ecojoi.crm.ai.released',
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

    return { configured: true, delivered: response.ok };
  } catch {
    return { configured: true, delivered: false };
  } finally {
    clearTimeout(timeout);
  }
}
