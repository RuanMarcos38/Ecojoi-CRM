import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const step=z.object({
  delay_minutes:z.coerce.number().int().min(0).max(525600),
  action_type:z.enum(['task','whatsapp','email','internal_note']),
  template_body:z.string().max(4000).optional().nullable()
});
const schema=z.object({
  name:z.string().trim().min(2).max(160),
  description:z.string().trim().max(1000).optional().nullable(),
  active:z.boolean().default(true),
  steps:z.array(step).min(1).max(50)
});

export async function GET(){
  try{
    const ctx=await requirePermission('automations.view');
    const supabase=await createClient();
    const {data,error}=await supabase.from('sales_sequences')
      .select('id,name,description,active,created_at,sales_sequence_steps(id,step_order,delay_minutes,action_type,template_body)')
      .eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false});
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'sequences_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('automations.manage');
    const input=schema.parse(await req.json());
    const supabase=await createClient();
    const {data:sequence,error}=await supabase.from('sales_sequences')
      .insert({tenant_id:ctx.tenantId,name:input.name,description:input.description??null,active:input.active,created_by:ctx.userId})
      .select().single();
    if(error)throw error;

    const rows=input.steps.map((s,index)=>({
      tenant_id:ctx.tenantId,sequence_id:sequence.id,step_order:index+1,delay_minutes:s.delay_minutes,action_type:s.action_type,template_body:s.template_body??null
    }));
    const {error:stepError}=await supabase.from('sales_sequence_steps').insert(rows);
    if(stepError){
      await supabase.from('sales_sequences').delete().eq('tenant_id',ctx.tenantId).eq('id',sequence.id);
      throw stepError;
    }

    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'sequence.create',entity:'sales_sequence',entityId:sequence.id});
    return NextResponse.json({data:{...sequence,steps:rows}},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'sequence_create_failed'},{status:500});
  }
}
