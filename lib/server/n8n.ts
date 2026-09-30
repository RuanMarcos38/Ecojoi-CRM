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
  const admin = createAdminClient();
  const { data: lastExecution } = await admin
    .from('n8n_execution_logs')
    .select('status,event_type,duration_ms,error,created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    importConfigured: n8nImportRuntimeConfigured(),
    aiEnabled: tenant.aiEnabled,
    webhookConfigured: Boolean(tenant.webhookUrl),
    workflowId: tenant.workflowId,
    lastExecution: lastExecution ?? null
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

export async function importN8nWorkflow(tenantId: string, input: WorkflowJson, importedBy?: string | null) {
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
  const admin = createAdminClient();

  const { data: lastVersion } = await admin
    .from('n8n_workflow_versions')
    .select('version_number')
    .eq('tenant_id', tenantId)
    .eq('workflow_name', workflow.name)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const versionNumber = Number(lastVersion?.version_number ?? 0) + 1;

  const { error: versionError } = await admin
    .from('n8n_workflow_versions')
    .insert({
      tenant_id: tenantId,
      workflow_id: workflowId,
      workflow_name: workflow.name,
      version_number: versionNumber,
      workflow_json: workflow,
      imported_by: importedBy ?? null
    });
  if (versionError) throw versionError;

  if (workflowId) {
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
    active: payload?.active === true,
    version: versionNumber
  };
}

export async function recordN8nExecution(input: {
  tenantId: string;
  workflowId?: string | null;
  conversationId?: string | null;
  eventType: string;
  status: 'started' | 'success' | 'failed';
  durationMs?: number | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  await admin.from('n8n_execution_logs').insert({
    tenant_id: input.tenantId,
    workflow_id: input.workflowId ?? null,
    conversation_id: input.conversationId ?? null,
    event_type: input.eventType,
    status: input.status,
    duration_ms: input.durationMs ?? null,
    error: input.error?.slice(0, 2000) ?? null,
    metadata: input.metadata ?? {}
  });
}
