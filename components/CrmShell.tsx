'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function CrmShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isUnifiedApp = pathname?.startsWith('/app/atendimento');

  useEffect(() => {
    if (pathname?.startsWith('/app') && !isUnifiedApp) {
      router.replace('/app/atendimento');
    }
  }, [isUnifiedApp, pathname, router]);

  if (isUnifiedApp) return <>{children}</>;
  if (pathname?.startsWith('/app')) return null;

  return <div className="shell"><Sidebar/><main className="main"><Topbar/>{children}</main></div>;
}
