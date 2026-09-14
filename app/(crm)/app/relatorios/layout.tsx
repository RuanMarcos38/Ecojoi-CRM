import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
export default async function Guard({children}:{children:React.ReactNode}){try{const ctx=await requirePermission('reports.view');await requireFeature(ctx,'relatorios');}catch{redirect('/app')}return <>{children}</>}