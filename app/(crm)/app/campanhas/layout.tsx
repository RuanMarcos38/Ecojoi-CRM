import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { hasSupabasePublicEnv } from '@/lib/supabase/env';

export default async function CampanhasLayout({ children }: { children: React.ReactNode }) {
  try {
    const ctx = await requirePermission('reports.view');
    await requireFeature(ctx, 'relatorios');
  } catch {
    if (!hasSupabasePublicEnv()) return <>{children}</>;
    redirect('/app');
  }
  return <>{children}</>;
}
