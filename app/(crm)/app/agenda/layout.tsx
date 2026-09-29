import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';

export default async function AgendaLayout({ children }: { children: React.ReactNode }) {
  try {
    await requirePermission('tasks.view');
  } catch {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <>{children}</>;
    redirect('/app');
  }
  return <>{children}</>;
}
