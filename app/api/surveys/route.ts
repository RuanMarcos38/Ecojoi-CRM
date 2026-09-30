import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const schema=z.object({
  name:z.string().trim().min(2).max(160),
  survey_type:z.enum(['nps','csat']),
  question:z.string().trim().min(4).max(500),
  active:z.boolean().default(true)
});

export async function GET(){
  try{
    const ctx=await requirePermission('reports.view');
    const supabase=await createClient();
    const {data,error}=await supabase.from('customer_surveys')
      .select('id,name,survey_type,kind,question,active,created_at,customer_survey_responses(id,score,comment,submitted_at)')
      .eq('tenant_id',ctx.tenantId)
      .is('contact_id',null)
      .order('created_at',{ascending:false});
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'surveys_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('reports.view');
    const input=schema.parse(await req.json());
    const supabase=await createClient();
    const {data,error}=await supabase.from('customer_surveys').insert({
      tenant_id:ctx.tenantId,
      contact_id:null,
      deal_id:null,
      kind:input.survey_type,
      name:input.name,
      survey_type:input.survey_type,
      question:input.question,
      active:input.active,
      created_by:ctx.userId
    }).select().single();
    if(error)throw error;
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'survey.create',entity:'survey',entityId:data.id});
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'survey_create_failed'},{status:500});
  }
}
