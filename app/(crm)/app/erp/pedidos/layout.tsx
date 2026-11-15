import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';

export default async function SalesOrdersLayout({ children }: { children: React.ReactNode }) {
  try {
    await requirePermission('deals.view');
  } catch (error) {
    if (error instanceof Response && [401, 403].includes(error.status)) redirect('/app');
    throw error;
  }
  return children;
}
