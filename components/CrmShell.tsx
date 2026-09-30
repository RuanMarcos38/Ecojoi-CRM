import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';

export function CrmShell({ children }: { children: React.ReactNode }) {
  return <><div className="shell"><Sidebar/><main className="main"><Topbar/>{children}</main></div><CommandPalette/></>;
}
