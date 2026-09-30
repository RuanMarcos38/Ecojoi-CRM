import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const patch=z.object({
  status:z.enum(['onboarding','in_progress','waiting_customer','completed','cancelled']).optional(),
  health_score:z.coerce.number().int().min(0).max(100).optional(),
  due_at:z.string().datetime().nullable().optional(),
  renewal_at:z.string().datetime().nullable().optional(),
  next_action_at:z.string().datetime().nullable().optional(),
  notes:z.string().trim().max(10000).nullable().optional(),
  owner_id:z.string().uuid().nullable().optional(),
  title:z.string().trim().min(2).max(180).optional()
});

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const ctx=await requirePermission('deals.update');
    const {id}=await params;
    const input=patch.parse(await req.json());
    const update:any={...input,updated_at:new Date().toISOString()};
    if(input.status==='completed')update.completed_at=new Date().toISOString();

    const supabase=await createClient();
    const {data,error}=await supabase.from('customer_success_cases')
      .update(update).eq('tenant_id',ctx.tenantId).eq('id',id).select().maybeSingle();
    if(error)throw error;
    if(!data)return NextResponse.json({error:'not_found'},{status:404});

    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'customer_success.update',entity:'customer_success_case',entityId:id,metadata:{fields:Object.keys(input)}});
    return NextResponse.json({data});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'customer_success_update_failed'},{status:500});
  }
}
