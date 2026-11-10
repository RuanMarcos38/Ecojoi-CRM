import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ClientErrorBoundary } from './ClientErrorBoundary';
import { SingleSessionGuard } from './SingleSessionGuard';

export function CrmShell({ children }: { children: React.ReactNode }) {
  return <div className="shell ecojoi-shell">
    <SingleSessionGuard/>
    <ClientErrorBoundary label="Menu" compact><Sidebar/></ClientErrorBoundary>
    <main className="main">
      <ClientErrorBoundary label="Barra superior" compact><Topbar/></ClientErrorBoundary>
      <ClientErrorBoundary label="Conteúdo">{children}</ClientErrorBoundary>
    </main>
  </div>;
}
