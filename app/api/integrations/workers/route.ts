import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { runOperationalWorkers } from '@/lib/server/worker';

export async function GET(){
  try{
    const ctx=await requirePermission('settings.view');
    const admin=createAdminClient();
    const {data,error}=await admin.from('worker_runs')
      .select('id,worker_name,status,processed,succeeded,failed,duration_ms,metadata,error,created_at')
      .or(`tenant_id.is.null,tenant_id.eq.${ctx.tenantId}`)
      .order('created_at',{ascending:false}).limit(30);
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'worker_runs_fetch_failed'},{status:500});
  }
}

export async function POST(){
  try{
    const ctx=await requirePermission('settings.manage');
    const data=await runOperationalWorkers(ctx.tenantId);
    return NextResponse.json({data});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'worker_run_failed'},{status:500});
  }
}
