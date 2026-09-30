import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { cleanupExpiredAttachments } from '@/lib/server/retention';
import { createClient } from '@/lib/supabase/server';

export async function GET(){
  try{
    const ctx=await requirePermission('settings.view');
    const supabase=await createClient();
    const {data,error}=await supabase.from('tenant_settings')
      .select('attachment_retention_days')
      .eq('tenant_id',ctx.tenantId)
      .maybeSingle();
    if(error)throw error;
    return NextResponse.json({data:{attachment_retention_days:Number(data?.attachment_retention_days??365)}});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'retention_settings_fetch_failed'},{status:500});
  }
}

export async function POST(){
  try{
    const ctx=await requirePermission('settings.manage');
    const data=await cleanupExpiredAttachments(ctx.tenantId,100);
    return NextResponse.json({data});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'attachment_cleanup_failed'},{status:500});
  }
}
