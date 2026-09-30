import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const schema=z.object({sequence_id:z.string().uuid(),contact_id:z.string().uuid()});

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('automations.manage');
    const input=schema.parse(await req.json());
    const supabase=await createClient();
    const [{data:sequence},{data:contact},{data:firstStep}]=await Promise.all([
      supabase.from('sales_sequences').select('id,active').eq('tenant_id',ctx.tenantId).eq('id',input.sequence_id).maybeSingle(),
      supabase.from('contacts').select('id').eq('tenant_id',ctx.tenantId).eq('id',input.contact_id).maybeSingle(),
      supabase.from('sales_sequence_steps').select('delay_minutes').eq('tenant_id',ctx.tenantId).eq('sequence_id',input.sequence_id).eq('step_order',1).maybeSingle()
    ]);
    if(!sequence?.active||!contact||!firstStep)return NextResponse.json({error:'sequence_or_contact_not_found'},{status:404});
    const nextRun=new Date(Date.now()+Number(firstStep.delay_minutes??0)*60000).toISOString();
    const {data,error}=await supabase.from('sales_sequence_enrollments').insert({
      tenant_id:ctx.tenantId,sequence_id:input.sequence_id,contact_id:input.contact_id,
      current_step:0,status:'active',next_run_at:nextRun,enrolled_by:ctx.userId
    }).select().single();
    if(error)throw error;
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'sequence.enroll',entity:'sales_sequence',entityId:input.sequence_id,metadata:{contact_id:input.contact_id}});
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'sequence_enroll_failed'},{status:500});
  }
}
