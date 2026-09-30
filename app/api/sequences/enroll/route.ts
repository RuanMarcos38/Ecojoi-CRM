import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
const schema=z.object({sequence_id:z.string().uuid(),contact_id:z.string().uuid()});
export async function POST(req:Request){
  try{
    const ctx=await requirePermission('automations.manage');const body=schema.parse(await req.json());const supabase=await createClient();
    const [{data:sequence},{data:contact},{data:firstStep}]=await Promise.all([
      supabase.from('sequences').select('id').eq('tenant_id',ctx.tenantId).eq('id',body.sequence_id).eq('active',true).maybeSingle(),
      supabase.from('contacts').select('id,owner_id').eq('tenant_id',ctx.tenantId).eq('id',body.contact_id).maybeSingle(),
      supabase.from('sequence_steps').select('delay_minutes').eq('tenant_id',ctx.tenantId).eq('sequence_id',body.sequence_id).eq('position',0).maybeSingle()
    ]);
    if(!sequence||!contact)return NextResponse.json({error:'not_found'},{status:404});
    const next=new Date(Date.now()+Number(firstStep?.delay_minutes??0)*60000).toISOString();
    const {data,error}=await supabase.from('sequence_enrollments').upsert({tenant_id:ctx.tenantId,sequence_id:body.sequence_id,contact_id:body.contact_id,owner_id:contact.owner_id??ctx.userId,current_position:0,status:'active',next_run_at:next,updated_at:new Date().toISOString()},{onConflict:'sequence_id,contact_id'}).select().single();
    if(error)throw error;return NextResponse.json({data},{status:201});
  }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'sequence_enroll_failed'},{status:500});}
}
