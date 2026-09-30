import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';

const TABLES=[
  'contacts','organizations','deals','tasks','conversations','messages','products','proposals',
  'proposal_items','sales_sequences','sales_sequence_enrollments','customer_success_cases',
  'prospects','capture_forms','booking_requests','customer_surveys','customer_survey_responses',
  'external_emails','external_calendar_events','interaction_transcripts'
] as const;

export async function GET(){
  try{
    const ctx=await requirePermission('settings.manage');
    const admin=createAdminClient();
    const snapshot:Record<string,unknown[]|{error:string}>={};

    for(const table of TABLES){
      const {data,error}=await admin.from(table).select('*').eq('tenant_id',ctx.tenantId).limit(10000);
      snapshot[table]=error?{error:error.message.slice(0,300)}:(data??[]);
    }

    const payload={
      format:'ecojoi-crm-tenant-export-v1',
      tenant_id:ctx.tenantId,
      generated_at:new Date().toISOString(),
      data:snapshot
    };

    const filename='ecojoi-crm-export-'+new Date().toISOString().slice(0,10)+'.json';
    return new NextResponse(JSON.stringify(payload,null,2),{
      status:200,
      headers:{
        'content-type':'application/json; charset=utf-8',
        'content-disposition':'attachment; filename="'+filename+'"',
        'cache-control':'no-store'
      }
    });
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'tenant_export_failed'},{status:500});
  }
}
