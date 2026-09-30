import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const question=z.object({label:z.string().trim().min(2).max(300),field_key:z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_]+$/),response_type:z.enum(['text','number','select','boolean']).default('text'),options:z.array(z.string().max(120)).default([]),required:z.boolean().default(false)});
const schema=z.object({name:z.string().trim().min(2).max(160),entity_type:z.enum(['contact','deal']).default('contact'),questions:z.array(question).min(1).max(50)});
const responseSchema=z.object({playbook_id:z.string().uuid(),contact_id:z.string().uuid().optional().nullable(),deal_id:z.string().uuid().optional().nullable(),answers:z.record(z.unknown())});

export async function GET(){
  try{
    const ctx=await requirePermission('contacts.view');const supabase=await createClient();
    const [{data,error},{data:questions}]=await Promise.all([
      supabase.from('playbooks').select('id,name,entity_type,active,created_at').eq('tenant_id',ctx.tenantId).eq('active',true).order('created_at',{ascending:false}),
      supabase.from('playbook_questions').select('id,playbook_id,label,field_key,response_type,options,required,sort_order').eq('tenant_id',ctx.tenantId).order('sort_order')
    ]);
    if(error)throw error;
    return NextResponse.json({data:(data??[]).map(p=>({...p,questions:(questions??[]).filter(q=>q.playbook_id===p.id)}))});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'playbooks_fetch_failed'},{status:500});}
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('settings.manage');const body=schema.parse(await req.json());const supabase=await createClient();
    const {data,error}=await supabase.from('playbooks').insert({tenant_id:ctx.tenantId,name:body.name,entity_type:body.entity_type,active:true}).select().single();
    if(error)throw error;
    const {error:qError}=await supabase.from('playbook_questions').insert(body.questions.map((q,index)=>({tenant_id:ctx.tenantId,playbook_id:data.id,...q,sort_order:index})));
    if(qError)throw qError;
    return NextResponse.json({data},{status:201});
  }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});return NextResponse.json({error:'playbook_create_failed'},{status:500});}
}

export async function PUT(req:Request){
  try{
    const ctx=await requirePermission('contacts.update');const body=responseSchema.parse(await req.json());const supabase=await createClient();
    const {data,error}=await supabase.from('playbook_responses').insert({tenant_id:ctx.tenantId,user_id:ctx.userId,...body}).select().single();
    if(error)throw error;
    return NextResponse.json({data},{status:201});
  }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'playbook_response_failed'},{status:500});}
}
