import { createClient } from '@/lib/supabase/server';
import type { RequestContext } from '@/lib/auth/context';

export async function isFeatureEnabled(tenantId: string, featureName: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('feature_flags')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('feature_name', featureName)
    .maybeSingle();
  if (error) throw error;
  return data?.enabled === true;
}

export async function requireFeature(ctx: RequestContext, featureName: string) {
  if (!(await isFeatureEnabled(ctx.tenantId, featureName))) {
    throw new Response('Feature disabled', { status: 403 });
  }
}
