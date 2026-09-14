import { createClient } from '@/lib/supabase/server';
import type { Role, Permission } from './permissions';
import { hasPermission } from './permissions';

export type RequestContext = { userId: string; tenantId: string; role: Role; email?: string };

export async function getRequestContext(): Promise<RequestContext> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Response('Unauthorized', { status: 401 });

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('tenant_id, role, active')
    .eq('id', user.id)
    .single();

  if (error || !profile?.tenant_id || !profile?.role) throw new Response('Profile not configured', { status: 403 });
  if (profile.active !== true) throw new Response('User disabled', { status: 403 });

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('active')
    .eq('id', profile.tenant_id)
    .single();
  if (tenantError || tenant?.active !== true) throw new Response('Tenant disabled', { status: 403 });

  return { userId: user.id, tenantId: profile.tenant_id, role: profile.role as Role, email: user.email };
}

export async function requirePermission(permission: Permission) {
  const ctx = await getRequestContext();
  if (!hasPermission(ctx.role, permission)) throw new Response('Forbidden', { status: 403 });
  return ctx;
}
