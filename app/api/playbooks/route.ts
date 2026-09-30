import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const question=z.object({
  field_key:z.string().trim().min(1).max(60).regex(/^[a-z][a-z0-9_]*$/),
  label:z.string().trim().min(1).max(180),
  response_type:z.enum(['text','textarea','number','boolean','select']).default('text'),
  required:z.boolean().default(false),
  options:z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  sort_order:z.coerce.number().int().min(0).max(1000)
});

const schema=z.object({
  name:z.string().trim().min(2).max(160),
  description:z.string().trim().max(1000).optional().nullable(),
  entity_type:z.enum(['contact','deal','customer_success']).default('deal'),
  questions:z.array(question).min(1).max(50)
});

export async function GET(){
  try{
    const ctx=await requirePermission('automations.view');
    const supabase=await createClient();
    const {data,error}=await supabase.from('sales_playbooks')
      .select('id,name,description,entity_type,active,created_at,updated_at,sales_playbook_questions(id,field_key,label,response_type,required,options,sort_order)')
      .eq('tenant_id',ctx.tenantId).eq('active',true).order('created_at',{ascending:false});
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'playbooks_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('automations.manage');
    const input=schema.parse(await req.json());
    const supabase=await createClient();
    const {data:playbook,error}=await supabase.from('sales_playbooks')
      .insert({tenant_id:ctx.tenantId,name:input.name,description:input.description,entity_type:input.entity_type,active:true,created_by:ctx.userId})
      .select().single();
    if(error)throw error;

    const rows=input.questions.map((q,index)=>({
      tenant_id:ctx.tenantId,
      playbook_id:playbook.id,
      field_key:q.field_key,
      label:q.label,
      response_type:q.response_type,
      required:q.required,
      options:q.options,
      sort_order:q.sort_order??index
    }));
    const {error:questionsError}=await supabase.from('sales_playbook_questions').insert(rows);
    if(questionsError){
      await supabase.from('sales_playbooks').delete().eq('tenant_id',ctx.tenantId).eq('id',playbook.id);
      throw questionsError;
    }

    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'playbook.create',entity:'sales_playbook',entityId:playbook.id});
    return NextResponse.json({data:playbook},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'playbook_create_failed'},{status:500});
  }
}
