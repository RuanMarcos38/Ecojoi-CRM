import { createClient } from '@/lib/supabase/server';

export async function audit(entry: { tenantId: string; userId: string; action: string; entity: string; entityId?: string; metadata?: Record<string, unknown> }) {
  const supabase = await createClient();
  await supabase.from('audit_logs').insert({
    tenant_id: entry.tenantId,
    user_id: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    metadata: entry.metadata ?? {}
  });
}
