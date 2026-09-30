import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const schema=z.object({
  contact_id:z.string().uuid().optional().nullable(),
  deal_id:z.string().uuid().optional().nullable(),
  case_type:z.enum(['onboarding','post_sale','renewal']).default('post_sale'),
  title:z.string().trim().min(2).max(180),
  status:z.enum(['onboarding','in_progress','waiting_customer','completed','cancelled']).default('onboarding'),
  owner_id:z.string().uuid().optional().nullable(),
  health_score:z.coerce.number().int().min(0).max(100).default(80),
  due_at:z.string().datetime().optional().nullable(),
  renewal_at:z.string().datetime().optional().nullable(),
  next_action_at:z.string().datetime().optional().nullable(),
  notes:z.string().trim().max(10000).optional().nullable()
});

export async function GET(){
  try{
    const ctx=await requirePermission('deals.view');
    const supabase=await createClient();
    const {data,error}=await supabase.from('customer_success_cases')
      .select('id,contact_id,deal_id,case_type,status,title,health_score,due_at,renewal_at,next_action_at,notes,started_at,completed_at,created_at,updated_at,contact:contacts(id,name,email,phone),deal:deals(id,title,value,stage),owner:profiles!customer_success_cases_owner_id_fkey(id,full_name)')
      .eq('tenant_id',ctx.tenantId)
      .order('created_at',{ascending:false});
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'customer_success_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('deals.update');
    const input=schema.parse(await req.json());
    const supabase=await createClient();

    if(input.contact_id){
      const {data}=await supabase.from('contacts').select('id').eq('tenant_id',ctx.tenantId).eq('id',input.contact_id).maybeSingle();
      if(!data)return NextResponse.json({error:'contact_not_found'},{status:404});
    }
    if(input.deal_id){
      const {data}=await supabase.from('deals').select('id').eq('tenant_id',ctx.tenantId).eq('id',input.deal_id).maybeSingle();
      if(!data)return NextResponse.json({error:'deal_not_found'},{status:404});
    }

    const {data,error}=await supabase.from('customer_success_cases')
      .insert({tenant_id:ctx.tenantId,...input,owner_id:input.owner_id??ctx.userId})
      .select().single();
    if(error)throw error;

    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'customer_success.create',entity:'customer_success_case',entityId:data.id,metadata:{case_type:input.case_type}});
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'customer_success_create_failed'},{status:500});
  }
}
