import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const field=z.object({
  name:z.string().trim().min(1).max(80),
  label:z.string().trim().min(1).max(120),
  type:z.enum(['text','email','tel','textarea','number','select']),
  required:z.boolean().default(false),
  options:z.array(z.string().max(120)).optional()
});
const schema=z.object({
  slug:z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  name:z.string().trim().min(2).max(120),
  title:z.string().trim().min(2).max(180),
  description:z.string().trim().max(1000).optional().nullable(),
  source:z.string().trim().min(1).max(80).default('Formulário'),
  success_message:z.string().trim().max(500).default('Recebemos seus dados com sucesso.'),
  fields:z.array(field).min(1).max(30).optional(),
  active:z.boolean().default(true)
});

export async function GET(){
  try{
    const ctx=await requirePermission('contacts.view');
    const supabase=await createClient();
    const {data,error}=await supabase.from('capture_forms')
      .select('id,slug,name,title,description,fields,source,success_message,active,created_at,updated_at')
      .eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false});
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'capture_forms_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('settings.manage');
    const input=schema.parse(await req.json());
    const supabase=await createClient();
    const payload:any={tenant_id:ctx.tenantId,slug:input.slug,name:input.name,title:input.title,description:input.description??null,source:input.source,success_message:input.success_message,active:input.active,created_by:ctx.userId,updated_at:new Date().toISOString()};
    if(input.fields)payload.fields=input.fields;
    const {data,error}=await supabase.from('capture_forms').insert(payload).select().single();
    if(error)throw error;
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'capture_form.create',entity:'capture_form',entityId:data.id});
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'capture_form_create_failed'},{status:500});
  }
}
