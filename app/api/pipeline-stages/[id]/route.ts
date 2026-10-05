import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requirePermission} from '@/lib/auth/context';
import {createClient} from '@/lib/supabase/server';
import {audit} from '@/lib/server/audit';
const schema=z.object({name:z.string().trim().min(2).max(120).optional(),sort_order:z.coerce.number().int().min(0).max(10000).optional(),probability:z.coerce.number().int().min(0).max(100).optional(),active:z.boolean().optional()}).refine(v=>Object.keys(v).length>0);
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const ctx=await requirePermission('settings.manage'),{id}=await params,input=schema.parse(await req.json()),client=await createClient();
  const {data,error}=await client.from('pipeline_stages_v2').update(input).eq('id',id).eq('tenant_id',ctx.tenantId).select().maybeSingle();
  if(error){if(error.message?.includes('pipeline_stage_in_use'))return NextResponse.json({error:'pipeline_stage_in_use'},{status:409});throw error;}
  if(!data)return NextResponse.json({error:'not_found'},{status:404});
  await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:input.active===false?'pipeline.stage.retire':'pipeline.stage.update',entity:'pipeline_stage',entityId:id,metadata:{fields:Object.keys(input)}});
  return NextResponse.json({data});
 }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'pipeline_stage_update_failed'},{status:500});}
}

