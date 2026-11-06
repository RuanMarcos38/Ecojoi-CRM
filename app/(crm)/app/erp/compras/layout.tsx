import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';

export default async function PurchasesLayout({ children }: { children: React.ReactNode }) {
  try {
    await requirePermission('erp.purchases.view');
  } catch (error) {
    if (error instanceof Response && [401, 403].includes(error.status)) redirect('/app');
    throw error;
  }
  return children;
}
