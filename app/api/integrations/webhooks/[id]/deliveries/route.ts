import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/server/audit';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const ctx=await requirePermission('settings.view'),{id}=await params,client=await createClient();
  const {data,error}=await client.from('webhook_deliveries').select('id,event_type,status,attempts,max_attempts,response_status,error,created_at,delivered_at,next_attempt_at,duration_ms')
   .eq('tenant_id',ctx.tenantId).eq('subscription_id',id).order('created_at',{ascending:false}).limit(50);
  if(error)throw error;
  return NextResponse.json({data:data??[]},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'webhook_history_failed'},{status:500});}
}
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('test')}),
 z.object({action:z.literal('retry'),delivery_id:z.string().uuid()})
]);
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const ctx=await requirePermission('settings.manage'),{id}=await params,input=schema.parse(await req.json());
  const client=await createClient(),admin=createAdminClient();
  const {data:sub,error:readError}=await client.from('webhook_subscriptions').select('id,active').eq('tenant_id',ctx.tenantId).eq('id',id).maybeSingle();
  if(readError)throw readError;if(!sub)return NextResponse.json({error:'not_found'},{status:404});
  if(!sub.active)return NextResponse.json({error:'subscription_inactive'},{status:409});
  if(input.action==='test'){
   const {error}=await admin.from('webhook_deliveries').insert({tenant_id:ctx.tenantId,subscription_id:id,event_type:'webhook.test',payload:{test:true},status:'pending'});
   if(error)throw error;
  }else{
   const {data,error}=await admin.from('webhook_deliveries').update({status:'pending',attempts:0,error:null,next_attempt_at:new Date().toISOString(),locked_at:null,lease_token:null})
    .eq('tenant_id',ctx.tenantId).eq('subscription_id',id).eq('id',input.delivery_id).in('status',['failed','dead_letter'])
    .select('id').maybeSingle();
   if(error)throw error;if(!data)return NextResponse.json({error:'delivery_not_retryable'},{status:409});
  }
  await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'webhook.'+input.action,entity:'webhook_subscription',entityId:id,metadata:input.action==='retry'?{delivery_id:input.delivery_id}:{}});
  return NextResponse.json({queued:true},{status:202});
 }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'webhook_reprocess_failed'},{status:500});}
}

