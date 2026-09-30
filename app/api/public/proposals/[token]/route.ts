import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function find(token:string){
  const admin=createAdminClient();
  const {data,error}=await admin.from('proposals')
    .select('id,tenant_id,proposal_number,title,status,currency,subtotal,discount_percent,discount_value,total,valid_until,notes,terms,public_token,accepted_at,rejected_at,contact:contacts(name,email,phone),proposal_items(description,quantity,unit_price,discount_percent,line_total)')
    .eq('public_token',token).maybeSingle();
  if(error)throw error;
  return data??null;
}

export async function GET(_:Request,{params}:{params:Promise<{token:string}>}){
  try{
    const {token}=await params;
    const proposal=await find(token);
    if(!proposal||!['approved','sent','accepted','rejected','expired'].includes(proposal.status))return NextResponse.json({error:'proposal_not_found'},{status:404});
    if(proposal.valid_until&&new Date(proposal.valid_until+'T23:59:59').getTime()<Date.now()&&!['accepted','rejected'].includes(proposal.status)){
      const admin=createAdminClient();
      await admin.from('proposals').update({status:'expired',updated_at:new Date().toISOString()}).eq('id',proposal.id);
      proposal.status='expired';
    }
    return NextResponse.json({data:proposal});
  }catch{return NextResponse.json({error:'proposal_fetch_failed'},{status:500});}
}

export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){
  try{
    const {token}=await params;
    const input=await req.json();
    const action=String(input?.action??'');
    if(!['accept','reject'].includes(action))return NextResponse.json({error:'invalid_action'},{status:400});
    const proposal=await find(token);
    if(!proposal||!['approved','sent'].includes(proposal.status))return NextResponse.json({error:'proposal_unavailable'},{status:409});

    const admin=createAdminClient();
    const now=new Date().toISOString();
    const ip=(req.headers.get('x-forwarded-for')||'').split(',')[0].trim();
    const salt=process.env.PUBLIC_CAPTURE_HASH_SALT?.trim()||'';
    const ipHash=ip&&salt?createHash('sha256').update(salt+ip).digest('hex'):null;
    const patch=action==='accept'?{
      status:'accepted',accepted_at:now,
      accepted_name:String(input?.name??'').trim()||null,
      accepted_email:String(input?.email??'').trim()||null,
      accepted_ip:ipHash,
      accepted_user_agent:req.headers.get('user-agent'),
      updated_at:now
    }:{
      status:'rejected',rejected_at:now,updated_at:now
    };
    const {data,error}=await admin.from('proposals').update(patch).eq('id',proposal.id).select('id,status,accepted_at,rejected_at').single();
    if(error)throw error;
    return NextResponse.json({data});
  }catch{return NextResponse.json({error:'proposal_response_failed'},{status:500});}
}
