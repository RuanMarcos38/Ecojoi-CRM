import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ClientErrorBoundary } from './ClientErrorBoundary';

export function CrmShell({ children }: { children: React.ReactNode }) {
  return <div className="shell">
    <ClientErrorBoundary label="Menu" compact><Sidebar/></ClientErrorBoundary>
    <main className="main">
      <ClientErrorBoundary label="Barra superior" compact><Topbar/></ClientErrorBoundary>
      <ClientErrorBoundary label="Conteúdo">{children}</ClientErrorBoundary>
    </main>
  </div>;
}
