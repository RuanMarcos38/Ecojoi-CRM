import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { hasSupabasePublicEnv } from '@/lib/supabase/env';

export default async function AgendaLayout({ children }: { children: React.ReactNode }) {
  try {
    await requirePermission('tasks.view');
  } catch {
    if (!hasSupabasePublicEnv()) return <>{children}</>;
    redirect('/app');
  }
  return <>{children}</>;
}
