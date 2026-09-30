import { createAdminClient } from '@/lib/supabase/admin';

type WorkflowJson = {
  name?: string;
  nodes?: unknown[];
  connections?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: unknown;
  pinData?: unknown;
};

function baseUrl() {
  return process.env.N8N_BASE_URL?.trim().replace(/\/$/, '') || '';
}

function apiKey() {
  return process.env.N8N_API_KEY?.trim() || '';
}

export function n8nImportRuntimeConfigured() {
  return Boolean(baseUrl() && apiKey());
}

export async function getTenantN8nSettings(tenantId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenant_settings')
    .select('n8n_ai_enabled,n8n_webhook_url,n8n_workflow_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw error;
  return {
    aiEnabled: data?.n8n_ai_enabled === true,
    webhookUrl: data?.n8n_webhook_url?.trim() || null,
    workflowId: data?.n8n_workflow_id?.trim() || null
  };
}

export async function getN8nStatus(tenantId: string) {
  const tenant = await getTenantN8nSettings(tenantId);
  return {
    importConfigured: n8nImportRuntimeConfigured(),
    aiEnabled: tenant.aiEnabled,
    webhookConfigured: Boolean(tenant.webhookUrl),
    workflowId: tenant.workflowId
  };
}

function cleanWorkflow(input: WorkflowJson) {
  if (!Array.isArray(input.nodes) || !input.nodes.length) {
    throw new Error('workflow_nodes_required');
  }
  if (!input.connections || typeof input.connections !== 'object' || Array.isArray(input.connections)) {
    throw new Error('workflow_connections_required');
  }

  return {
    name: String(input.name || 'Ecojoi CRM - Workflow importado').trim().slice(0, 128),
    nodes: input.nodes,
    connections: input.connections,
    settings: input.settings && typeof input.settings === 'object' && !Array.isArray(input.settings) ? input.settings : {},
    ...(input.staticData !== undefined ? { staticData: input.staticData } : {}),
    ...(input.pinData !== undefined ? { pinData: input.pinData } : {})
  };
}

export async function importN8nWorkflow(tenantId: string, input: WorkflowJson) {
  const instance = baseUrl();
  const key = apiKey();
  if (!instance || !key) throw new Error('n8n_api_not_configured');

  const workflow = cleanWorkflow(input);
  const response = await fetch(`${instance}/api/v1/workflows`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-N8N-API-KEY': key
    },
    body: JSON.stringify(workflow),
    cache: 'no-store',
    signal: AbortSignal.timeout(20000)
  });

  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }

  if (!response.ok) {
    const detail = payload?.message || payload?.error || `n8n_http_${response.status}`;
    throw new Error(String(detail));
  }

  const workflowId = payload?.id ? String(payload.id) : null;
  if (workflowId) {
    const admin = createAdminClient();
    const { error } = await admin
      .from('tenant_settings')
      .upsert(
        {
          tenant_id: tenantId,
          n8n_workflow_id: workflowId,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'tenant_id' }
      );
    if (error) throw error;
  }

  return {
    id: workflowId,
    name: payload?.name ?? workflow.name,
    active: payload?.active === true
  };
}
