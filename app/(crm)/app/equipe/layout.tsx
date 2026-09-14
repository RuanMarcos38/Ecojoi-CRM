import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
export default async function Guard({children}:{children:React.ReactNode}){try{const ctx=await requirePermission('team.view');}catch{redirect('/app')}return <>{children}</>}