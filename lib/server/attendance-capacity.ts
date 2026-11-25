import { createAdminClient } from '@/lib/supabase/admin';

export async function hasAttendanceCapacity(tenantId: string, userId: string, automatic = false) {
  const db = createAdminClient();
  const [profile, workload] = await Promise.all([
    db.from('profiles').select('active,deleted_at,availability_state,receives_automatic_leads,max_open_conversations')
      .eq('tenant_id', tenantId).eq('id', userId).maybeSingle(),
    db.from('conversations').select('id', { head: true, count: 'exact' })
      .eq('tenant_id', tenantId).eq('assigned_to', userId).neq('status', 'closed')
  ]);
  if (profile.error || workload.error) throw profile.error ?? workload.error;
  const user = profile.data;
  return Boolean(user?.active && !user.deleted_at &&
    (!automatic || (user.receives_automatic_leads && user.availability_state === 'online')) &&
    workload.count !== null && workload.count < user.max_open_conversations);
}

export async function admitWaitingAttendance(tenantId: string, userId: string) {
  const db = createAdminClient();
  const settings = await db.from('tenant_settings').select('auto_assign_leads').eq('tenant_id', tenantId).maybeSingle();
  if (settings.error) throw settings.error;
  if (settings.data?.auto_assign_leads === false || !(await hasAttendanceCapacity(tenantId, userId, true))) return;

  const { data, error } = await db.from('conversations').select('id')
    .eq('tenant_id', tenantId).eq('channel', 'whatsapp').eq('attendance_state', 'waiting')
    .is('assigned_to', null).neq('status', 'closed')
    .order('attendance_changed_at', { ascending: true }).order('id').limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return;
  const now = new Date().toISOString();
  const result = await db.from('conversations').update({
    assigned_to: userId, attendance_state: 'in_service', attendance_changed_at: now, updated_at: now
  }).eq('tenant_id', tenantId).eq('id', data.id).eq('attendance_state', 'waiting')
    .is('assigned_to', null).neq('status', 'closed');
  if (result.error) throw result.error;
}
