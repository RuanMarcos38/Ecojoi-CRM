import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { hasSupabasePublicEnv } from '@/lib/supabase/env';
export default async function Guard({children}:{children:React.ReactNode}){try{const ctx=await requirePermission('conversations.view');await requireFeature(ctx,'atendimento');}catch{if(!hasSupabasePublicEnv())return <>{children}</>;redirect('/app')}return <>{children}</>}
