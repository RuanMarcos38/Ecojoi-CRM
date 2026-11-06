import { createClient } from '@/lib/supabase/server';

export function signAgentMessage(name: string, body: string) {
  const safeName = name.replace(/[\r\n*_~`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
  if (!safeName) throw new Error('agent_name_required');
  return `*${safeName}*\n${body}`;
}

export async function getAgentName(tenantId: string, userId: string) {
  const db = await createClient();
  const { data, error } = await db.from('profiles').select('full_name').eq('tenant_id', tenantId).eq('id', userId).single();
  if (error || !data?.full_name?.trim()) throw new Error('agent_name_required');
  return data.full_name as string;
}
