import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(){
  try{
    const ctx=await requirePermission('settings.view');
    const admin=createAdminClient();
    const [connections,emails,calendar,transcripts]=await Promise.all([
      admin.from('external_connections')
        .select('id,provider,account_email,display_name,status,sync_email,sync_calendar,last_mail_sync_at,last_calendar_sync_at,last_error,updated_at')
        .eq('tenant_id',ctx.tenantId)
        .order('updated_at',{ascending:false}),
      admin.from('external_emails').select('id',{head:true,count:'exact'}).eq('tenant_id',ctx.tenantId),
      admin.from('external_calendar_events').select('id',{head:true,count:'exact'}).eq('tenant_id',ctx.tenantId),
      admin.from('interaction_transcripts').select('id',{head:true,count:'exact'}).eq('tenant_id',ctx.tenantId)
    ]);

    return NextResponse.json({data:{
      connections:connections.data??[],
      counts:{
        emails:emails.count??0,
        calendar:calendar.count??0,
        transcripts:transcripts.count??0
      }
    }});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'external_connections_status_failed'},{status:500});
  }
}
