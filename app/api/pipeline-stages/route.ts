import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';
const schema=z.object({pipeline_id:z.string().uuid(),name:z.string().trim().min(2).max(120),
 semantic_stage:z.enum(['new','qualification','proposal','closing','won','lost']).default('qualification'),
 probability:z.coerce.number().int().min(0).max(100).default(10),sort_order:z.coerce.number().int().min(0).max(10000).default(50)});
export async function GET(req:Request){
 try{
  const ctx=await requirePermission('deals.view'),client=await createClient();
  const {data:pipelines,error:pError}=await client.from('pipelines').select('id,name,is_default').eq('tenant_id',ctx.tenantId).eq('active',true).order('is_default',{ascending:false}).order('created_at');
  if(pError)throw pError;
  const requested=new URL(req.url).searchParams.get('pipeline_id'),pipeline=pipelines?.find(p=>p.id===requested)??(!requested?pipelines?.[0]:null);
  if(!pipeline)return NextResponse.json({error:'pipeline_not_found'},{status:404});
  const {data,error}=await client.from('pipeline_stages_v2').select('id,pipeline_id,name,stage_key,semantic_stage,probability,sort_order,active').eq('tenant_id',ctx.tenantId).eq('pipeline_id',pipeline.id).order('sort_order').order('id');
  if(error)throw error;return NextResponse.json({data,pipelines,pipeline_id:pipeline.id},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'pipeline_stages_fetch_failed'},{status:500});}
}
export async function POST(req:Request){
 try{
  const ctx=await requirePermission('settings.manage'),input=schema.parse(await req.json()),client=await createClient();
  const {data:p,error:pError}=await client.from('pipelines').select('id').eq('tenant_id',ctx.tenantId).eq('id',input.pipeline_id).eq('active',true).maybeSingle();
  if(pError)throw pError;if(!p)return NextResponse.json({error:'pipeline_not_found'},{status:404});
  const {data,error}=await client.from('pipeline_stages_v2').insert({...input,tenant_id:ctx.tenantId,stage_key:'stage-'+randomUUID(),active:true,is_won:input.semantic_stage==='won',is_lost:input.semantic_stage==='lost'}).select().single();
  if(error)throw error;await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'pipeline.stage.create',entity:'pipeline_stage',entityId:data.id,metadata:{pipeline_id:input.pipeline_id}});
  return NextResponse.json({data},{status:201});
 }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'pipeline_stage_create_failed'},{status:500});}
}

