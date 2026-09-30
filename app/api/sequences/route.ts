import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const step=z.object({
  delay_minutes:z.coerce.number().int().min(0).max(525600),
  action_type:z.enum(['whatsapp','email','task','internal_message']),
  subject:z.string().trim().max(200).optional().nullable(),
  body:z.string().trim().min(1).max(5000)
});
const schema=z.object({
  name:z.string().trim().min(2).max(160),
  description:z.string().trim().max(1000).optional().nullable(),
  steps:z.array(step).min(1).max(30)
});

export async function GET(){
  try{
    const ctx=await requirePermission('automations.view');const supabase=await createClient();
    const [{data,error},{data:steps},{data:enrollments}]=await Promise.all([
      supabase.from('sequences').select('id,name,description,active,created_at,updated_at').eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false}),
      supabase.from('sequence_steps').select('id,sequence_id,position,delay_minutes,action_type,subject,body,metadata').eq('tenant_id',ctx.tenantId).order('position'),
      supabase.from('sequence_enrollments').select('sequence_id,status').eq('tenant_id',ctx.tenantId)
    ]);
    if(error)throw error;
    return NextResponse.json({data:(data??[]).map(sequence=>({
      ...sequence,
      steps:(steps??[]).filter(s=>s.sequence_id===sequence.id),
      enrollments:(enrollments??[]).filter(e=>e.sequence_id===sequence.id).length,
      active_enrollments:(enrollments??[]).filter(e=>e.sequence_id===sequence.id&&e.status==='active').length
    }))});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'sequences_fetch_failed'},{status:500});}
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('automations.manage');const body=schema.parse(await req.json());const supabase=await createClient();
    const {data,error}=await supabase.from('sequences').insert({tenant_id:ctx.tenantId,name:body.name,description:body.description??null,created_by:ctx.userId,active:true}).select().single();
    if(error)throw error;
    const {error:stepError}=await supabase.from('sequence_steps').insert(body.steps.map((s,index)=>({tenant_id:ctx.tenantId,sequence_id:data.id,position:index,...s})));
    if(stepError)throw stepError;
    return NextResponse.json({data},{status:201});
  }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});return NextResponse.json({error:'sequence_create_failed'},{status:500});}
}
