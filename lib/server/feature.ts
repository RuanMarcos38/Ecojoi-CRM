import { createClient } from '@/lib/supabase/server';

export async function isFeatureEnabled(tenantId: string, featureName: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('feature_flags')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('feature_name', featureName)
    .maybeSingle();
  return data?.enabled === true;
}
