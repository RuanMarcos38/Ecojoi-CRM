import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const schema=z.object({action:z.enum(['submit_approval','approve','send','reject'])});

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const ctx=await requirePermission('deals.update');
    const {id}=await params;
    const {action}=schema.parse(await req.json());
    const supabase=await createClient();
    const {data:proposal}=await supabase.from('proposals')
      .select('id,status,public_token,total,discount_percent')
      .eq('tenant_id',ctx.tenantId).eq('id',id).maybeSingle();
    if(!proposal)return NextResponse.json({error:'proposal_not_found'},{status:404});

    const patch:Record<string,unknown>={updated_at:new Date().toISOString()};
    if(action==='submit_approval'){
      if(proposal.status!=='draft')return NextResponse.json({error:'invalid_status_transition'},{status:409});
      patch.status='pending_approval';
    }else if(action==='approve'){
      if(!['company_admin','manager','super_admin'].includes(ctx.role))return NextResponse.json({error:'approval_requires_manager'},{status:403});
      if(!['draft','pending_approval'].includes(proposal.status))return NextResponse.json({error:'invalid_status_transition'},{status:409});
      patch.status='approved';patch.approved_by=ctx.userId;patch.approved_at=new Date().toISOString();
    }else if(action==='send'){
      if(!['approved','draft'].includes(proposal.status))return NextResponse.json({error:'proposal_must_be_approved'},{status:409});
      if(proposal.status==='draft'&&Number(proposal.discount_percent??0)>0)return NextResponse.json({error:'discounted_proposal_requires_approval'},{status:409});
      patch.status='sent';patch.sent_at=new Date().toISOString();
    }else if(action==='reject'){
      patch.status='rejected';patch.rejected_at=new Date().toISOString();
    }

    const {data,error}=await supabase.from('proposals').update(patch).eq('tenant_id',ctx.tenantId).eq('id',id).select().single();
    if(error)throw error;
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:`proposal.${action}`,entity:'proposal',entityId:id});
    const appUrl=process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/,'')||'';
    return NextResponse.json({data:{...data,public_url:appUrl?`${appUrl}/proposal/${data.public_token}`:`/proposal/${data.public_token}`}});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'proposal_update_failed'},{status:500});
  }
}
