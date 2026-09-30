import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { emitWebhookEvent } from '@/lib/server/webhook-dispatch';

const actionSchema=z.object({action:z.enum(['accept','reject']),name:z.string().trim().min(2).max(140).optional(),email:z.string().email().optional()});

export async function GET(_:Request,{params}:{params:Promise<{token:string}>}){
  const {token}=await params;const admin=createAdminClient();
  const {data,error}=await admin.from('proposals').select('id,tenant_id,proposal_number,title,status,currency,subtotal,discount_percent,discount_value,total,valid_until,notes,terms,created_at,contact:contacts(name,email),items:proposal_items(id,description,quantity,unit_price,discount_percent,line_total,sort_order)').eq('public_token',token).maybeSingle();
  if(error||!data)return NextResponse.json({error:'proposal_not_found'},{status:404});
  const expired=data.valid_until&&new Date(data.valid_until+'T23:59:59').getTime()<Date.now();
  if(expired&&data.status!=='accepted')await admin.from('proposals').update({status:'expired',updated_at:new Date().toISOString()}).eq('id',data.id);
  return NextResponse.json({data:{...data,status:expired&&data.status!=='accepted'?'expired':data.status}});
}

export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){
  try{
    const {token}=await params;const body=actionSchema.parse(await req.json());const admin=createAdminClient();
    const {data:proposal}=await admin.from('proposals').select('id,tenant_id,deal_id,status,valid_until,total,title').eq('public_token',token).maybeSingle();
    if(!proposal)return NextResponse.json({error:'proposal_not_found'},{status:404});
    if(['accepted','rejected','expired'].includes(proposal.status))return NextResponse.json({error:'proposal_closed'},{status:409});
    if(proposal.valid_until&&new Date(proposal.valid_until+'T23:59:59').getTime()<Date.now())return NextResponse.json({error:'proposal_expired'},{status:409});
    const now=new Date().toISOString();
    if(body.action==='accept'){
      await admin.from('proposals').update({status:'accepted',accepted_at:now,accepted_name:body.name??null,accepted_email:body.email??null,accepted_ip:req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()??null,accepted_user_agent:req.headers.get('user-agent'),updated_at:now}).eq('id',proposal.id);
      if(proposal.deal_id)await admin.from('deals').update({stage:'won',probability:100,closed_at:now,stage_changed_at:now,updated_at:now}).eq('tenant_id',proposal.tenant_id).eq('id',proposal.deal_id);
      await emitWebhookEvent(proposal.tenant_id,'proposal.accepted',proposal.id,{proposal_id:proposal.id,deal_id:proposal.deal_id,total:proposal.total,title:proposal.title});
    }else{
      await admin.from('proposals').update({status:'rejected',rejected_at:now,updated_at:now}).eq('id',proposal.id);
      await emitWebhookEvent(proposal.tenant_id,'proposal.rejected',proposal.id,{proposal_id:proposal.id,deal_id:proposal.deal_id,total:proposal.total,title:proposal.title});
    }
    return NextResponse.json({ok:true,status:body.action==='accept'?'accepted':'rejected'});
  }catch(e){if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'proposal_action_failed'},{status:500});}
}
