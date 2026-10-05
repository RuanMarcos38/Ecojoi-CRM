import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateWebhookUrl } from '@/lib/server/webhook-transport';
import { audit } from '@/lib/server/audit';
const schema=z.object({
 name:z.string().trim().min(2).max(120).optional(),endpoint_url:z.string().url().max(2000).optional(),
 active:z.boolean().optional(),rotate_secret:z.boolean().optional(),
 events:z.array(z.enum(['lead.created','contact.updated','conversation.received','message.sent','deal.created','deal.won','task.created','proposal.created','booking.created'])).min(1).max(20).optional()
}).refine(value=>Object.keys(value).length>0);
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const ctx=await requirePermission('settings.manage');const {id}=await params;
  const {rotate_secret,...input}=schema.parse(await req.json());
  if(input.endpoint_url){try{validateWebhookUrl(input.endpoint_url);}catch{return NextResponse.json({error:'webhook_https_public_endpoint_required'},{status:400});}}
  const client=await createClient(),admin=createAdminClient();
  const {data:existing,error:readError}=await client.from('webhook_subscriptions').select('id').eq('tenant_id',ctx.tenantId).eq('id',id).maybeSingle();
  if(readError)throw readError;if(!existing)return NextResponse.json({error:'not_found'},{status:404});
  const {data,error}=await client.from('webhook_subscriptions').update({...input,updated_at:new Date().toISOString()})
   .eq('tenant_id',ctx.tenantId).eq('id',id).select('id,name,endpoint_url,events,active,last_status,last_delivery_at,last_error,created_at').single();
  if(error)throw error;
  let signingSecret:string|undefined;
  if(rotate_secret){
   signingSecret=randomBytes(32).toString('base64url');
   const {error:secretError}=await admin.from('webhook_secrets').update({signing_key:signingSecret}).eq('tenant_id',ctx.tenantId).eq('subscription_id',id).select('subscription_id').single();
   if(secretError)throw secretError;
  }
  await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:rotate_secret?'webhook.secret_rotate':'webhook.update',entity:'webhook_subscription',entityId:id,metadata:{fields:Object.keys(input)}});
  return NextResponse.json({data:{...data,...(signingSecret?{signing_secret:signingSecret}:{})}},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'webhook_update_failed'},{status:500});}
}

