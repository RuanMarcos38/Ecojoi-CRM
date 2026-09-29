'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function CrmShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/app/atendimento')) return <>{children}</>;
  return <div className="shell"><Sidebar/><main className="main"><Topbar/>{children}</main></div>;
}
