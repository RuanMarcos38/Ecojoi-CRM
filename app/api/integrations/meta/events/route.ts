import{NextResponse}from'next/server';
import{z}from'zod';
import{requirePermission}from'@/lib/auth/context';
import{createAdminClient}from'@/lib/supabase/admin';
import{audit}from'@/lib/server/audit';
export async function GET(){
 try{
  const ctx=await requirePermission('settings.view');
  const {data,error}=await createAdminClient().from('integration_events')
   .select('id,event_type,processing_status,attempts,max_attempts,last_error,received_at,processed_at')
   .eq('tenant_id',ctx.tenantId).eq('provider','meta').order('received_at',{ascending:false}).limit(50);
  if(error)throw error;return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'meta_events_fetch_failed'},{status:500});}
}
export async function POST(req:Request){
 try{
  const ctx=await requirePermission('settings.manage'),{event_id}=z.object({event_id:z.string().regex(/^\d{1,20}$/)}).parse(await req.json());
  const {data,error}=await createAdminClient().from('integration_events').update({
   processing_status:'pending',attempts:0,next_attempt_at:new Date().toISOString(),locked_at:null,lease_token:crypto.randomUUID(),last_error:null
  }).eq('id',event_id).eq('tenant_id',ctx.tenantId).eq('provider','meta').in('processing_status',['failed','dead_letter']).not('inbound_payload','is',null).select('id').maybeSingle();
  if(error)throw error;if(!data)return NextResponse.json({error:'event_not_retryable'},{status:409});
  await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'meta.event.retry',entity:'integration_event',entityId:event_id});
  return NextResponse.json({queued:true},{status:202});
 }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'meta_event_retry_failed'},{status:500});}
}

