import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { webhookSecretHash,webhookSigningSecret,retryWebhookJobs } from '@/lib/server/webhook-dispatch';

const schema=z.object({name:z.string().trim().min(2).max(120),endpoint_url:z.string().url().max(2000),events:z.array(z.string().min(1).max(120)).min(1),active:z.boolean().default(true)});

export async function GET(){
  try{const ctx=await requirePermission('settings.view');const supabase=await createClient();
    const [{data,error},{data:jobs}]=await Promise.all([
      supabase.from('webhook_subscriptions').select('id,name,endpoint_url,events,active,last_status,last_delivery_at,last_error,created_at').eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false}),
      supabase.from('webhook_delivery_jobs').select('id,subscription_id,event_type,status,attempts,last_error,created_at,completed_at').eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false}).limit(100)
    ]);
    if(error)throw error;return NextResponse.json({data:data??[],jobs:jobs??[]});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'webhooks_fetch_failed'},{status:500});}
}
export async function POST(req:Request){
  try{const ctx=await requirePermission('settings.manage');const body=schema.parse(await req.json());const supabase=await createClient();
    const {data,error}=await supabase.from('webhook_subscriptions').insert({tenant_id:ctx.tenantId,...body,secret_hash:null}).select('id,name,endpoint_url,events,active,created_at').single();
    if(error)throw error;
    const secret=webhookSigningSecret(data.id);const hash=webhookSecretHash(data.id);
    if(hash)await supabase.from('webhook_subscriptions').update({secret_hash:hash}).eq('tenant_id',ctx.tenantId).eq('id',data.id);
    return NextResponse.json({data:{...data,signing_secret:secret||null}},{status:201});
  }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'webhook_create_failed'},{status:500});}
}
export async function PATCH(){
  try{const ctx=await requirePermission('settings.manage');const data=await retryWebhookJobs(ctx.tenantId);return NextResponse.json({data});}
  catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'webhook_retry_failed'},{status:500});}
}
