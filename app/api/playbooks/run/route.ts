import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const schema=z.object({
  playbook_id:z.string().uuid(),
  contact_id:z.string().uuid().optional().nullable(),
  deal_id:z.string().uuid().optional().nullable(),
  success_case_id:z.string().uuid().optional().nullable(),
  responses:z.record(z.unknown())
});

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('automations.manage');
    const input=schema.parse(await req.json());
    const supabase=await createClient();
    const {data:playbook}=await supabase.from('sales_playbooks').select('id').eq('tenant_id',ctx.tenantId).eq('id',input.playbook_id).eq('active',true).maybeSingle();
    if(!playbook)return NextResponse.json({error:'playbook_not_found'},{status:404});

    const {data,error}=await supabase.from('sales_playbook_runs').insert({
      tenant_id:ctx.tenantId,
      playbook_id:input.playbook_id,
      contact_id:input.contact_id??null,
      deal_id:input.deal_id??null,
      success_case_id:input.success_case_id??null,
      responses:input.responses,
      completed_by:ctx.userId
    }).select().single();
    if(error)throw error;
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'playbook.complete',entity:'sales_playbook_run',entityId:data.id,metadata:{playbook_id:input.playbook_id}});
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'playbook_run_failed'},{status:500});
  }
}
