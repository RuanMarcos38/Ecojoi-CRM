import { createClient } from '@/lib/supabase/server';

export async function audit(entry: { tenantId: string; userId: string; action: string; entity: string; entityId?: string; metadata?: Record<string, unknown> }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('write_audit_log', {
    p_action: entry.action,
    p_entity: entry.entity,
    p_entity_id: entry.entityId ?? null,
    p_metadata: entry.metadata ?? {}
  });
  if (error) console.error('audit_log_failed', error.message);
}
