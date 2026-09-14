import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
export default async function Guard({children}:{children:React.ReactNode}){try{const ctx=await requirePermission('conversations.view');await requireFeature(ctx,'atendimento');}catch{redirect('/app')}return <>{children}</>}