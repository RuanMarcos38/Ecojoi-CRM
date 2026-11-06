import './app/ecojoi-reference.css';
import './app/comfort-theme.css';
import { CrmShell } from '@/components/CrmShell';
export default function CrmLayout({children}:{children:React.ReactNode}){return <CrmShell>{children}</CrmShell>}
