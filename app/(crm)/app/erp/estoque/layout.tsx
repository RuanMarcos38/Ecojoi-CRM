import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';

export default async function StockLayout({ children }: { children: React.ReactNode }) {
  try {
    await requirePermission('erp.stock.view');
  } catch (error) {
    if (error instanceof Response && [401, 403].includes(error.status)) redirect('/app');
    throw error;
  }
  return children;
}
