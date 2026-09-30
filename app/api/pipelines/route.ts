import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const pipelineSchema=z.object({
  name:z.string().trim().min(2).max(120),
  description:z.string().trim().max(500).optional().nullable()
});
const lossSchema=z.object({name:z.string().trim().min(2).max(120)});

export async function GET(){
  try{
    const ctx=await requirePermission('deals.view');
    const supabase=await createClient();
    const [{data:pipelines,error:pError},{data:stages,error:sError},{data:reasons,error:rError}]=await Promise.all([
      supabase.from('pipelines').select('id,name,description,active,is_default,created_at').eq('tenant_id',ctx.tenantId).order('created_at'),
      supabase.from('pipeline_stages_v2').select('id,pipeline_id,name,stage_key,sort_order,probability,is_won,is_lost').eq('tenant_id',ctx.tenantId).order('sort_order'),
      supabase.from('loss_reasons').select('id,name,active').eq('tenant_id',ctx.tenantId).eq('active',true).order('name')
    ]);
    if(pError||sError||rError)throw pError??sError??rError;
    const rows=(pipelines??[]).map(p=>({...p,stages:(stages??[]).filter(s=>s.pipeline_id===p.id)}));
    return NextResponse.json({data:{pipelines:rows,loss_reasons:reasons??[]}});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'pipelines_fetch_failed'},{status:500});}
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('deals.update');
    const payload=await req.json();
    const supabase=await createClient();
    if(payload?.type==='loss_reason'){
      const body=lossSchema.parse(payload);
      const {data,error}=await supabase.from('loss_reasons').upsert({tenant_id:ctx.tenantId,name:body.name,active:true},{onConflict:'tenant_id,name'}).select().single();
      if(error)throw error; return NextResponse.json({data},{status:201});
    }
    const body=pipelineSchema.parse(payload);
    const {data,error}=await supabase.from('pipelines').insert({tenant_id:ctx.tenantId,name:body.name,description:body.description??null}).select().single();
    if(error)throw error;
    const defaults=[
      ['Novo','new',10,10,false,false],
      ['Qualificação','qualification',20,25,false,false],
      ['Proposta','proposal',30,60,false,false],
      ['Fechamento','closing',40,80,false,false],
      ['Ganho','won',50,100,true,false],
      ['Perdido','lost',60,0,false,true]
    ];
    const {error:stageError}=await supabase.from('pipeline_stages_v2').insert(defaults.map(([name,key,sort,prob,won,lost])=>({
      tenant_id:ctx.tenantId,pipeline_id:data.id,name,stage_key:key,sort_order:sort,probability:prob,is_won:won,is_lost:lost
    })));
    if(stageError)throw stageError;
    return NextResponse.json({data},{status:201});
  }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'pipeline_create_failed'},{status:500});}
}
