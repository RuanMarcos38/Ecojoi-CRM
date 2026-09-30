import { randomBytes,createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const schema=z.object({
  name:z.string().trim().min(2).max(120),
  endpoint_url:z.string().url().max(2000),
  events:z.array(z.enum(['lead.created','contact.updated','conversation.received','message.sent','deal.created','deal.won','task.created','proposal.created','booking.created'])).min(1).max(20)
});

export async function GET(){
  try{
    const ctx=await requirePermission('settings.view');
    const supabase=await createClient();
    const {data,error}=await supabase.from('webhook_subscriptions')
      .select('id,name,endpoint_url,events,active,last_status,last_delivery_at,last_error,created_at')
      .eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false});
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'webhook_subscriptions_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('settings.manage');
    const input=schema.parse(await req.json());
    const rawSecret=randomBytes(24).toString('base64url');
    const secretHash=createHash('sha256').update(rawSecret).digest('hex');
    const supabase=await createClient();
    const {data,error}=await supabase.from('webhook_subscriptions')
      .insert({tenant_id:ctx.tenantId,name:input.name,endpoint_url:input.endpoint_url,events:input.events,secret_hash:secretHash,active:true})
      .select('id,name,endpoint_url,events,active,created_at').single();
    if(error)throw error;
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'webhook.create',entity:'webhook_subscription',entityId:data.id});
    return NextResponse.json({data:{...data,signing_secret:rawSecret}},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'webhook_subscription_create_failed'},{status:500});
  }
}
