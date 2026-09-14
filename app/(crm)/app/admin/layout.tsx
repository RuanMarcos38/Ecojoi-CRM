import { redirect } from 'next/navigation';
import { getRequestContext } from '@/lib/auth/context';
export default async function AdminGuard({children}:{children:React.ReactNode}){try{const ctx=await getRequestContext();if(ctx.role!=='super_admin')redirect('/app')}catch{redirect('/app')}return <>{children}</>}