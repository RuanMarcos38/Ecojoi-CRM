import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const entitySchema=z.enum(['contacts','leads','deals','tasks']);
const fieldTypeSchema=z.enum(['text','textarea','number','date','boolean','select','email','phone','url']);

const schema=z.object({
  entity_type:entitySchema.default('contacts'),
  field_key:z.string().trim().min(1).max(60).regex(/^[a-z][a-z0-9_]*$/),
  label:z.string().trim().min(1).max(120),
  field_type:fieldTypeSchema,
  options:z.array(z.string().trim().min(1).max(120)).max(100).optional().default([]),
  required:z.boolean().optional().default(false),
  active:z.boolean().optional().default(true),
  sort_order:z.coerce.number().int().min(0).max(10000).optional().default(0)
});

export async function GET(request:Request){
  try{
    const ctx=await requirePermission('contacts.view');
    const entity=new URL(request.url).searchParams.get('entity');
    const supabase=await createClient();

    let query=supabase.from('custom_field_definitions')
      .select('id,entity_type,field_key,label,field_type,options,required,active,sort_order,created_at,updated_at')
      .eq('tenant_id',ctx.tenantId)
      .order('sort_order',{ascending:true})
      .order('label',{ascending:true});

    if(entity&&['contacts','leads','deals','tasks'].includes(entity)) query=query.eq('entity_type',entity);
    const {data,error}=await query;
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'custom_fields_fetch_failed'},{status:500});
  }
}

export async function POST(request:Request){
  try{
    const ctx=await requirePermission('settings.manage');
    const input=schema.parse(await request.json());
    const supabase=await createClient();
    const {data,error}=await supabase.from('custom_field_definitions')
      .upsert({
        tenant_id:ctx.tenantId,
        ...input,
        updated_at:new Date().toISOString(),
        created_by:ctx.userId
      },{onConflict:'tenant_id,entity_type,field_key'})
      .select()
      .single();
    if(error)throw error;

    await audit({
      tenantId:ctx.tenantId,
      userId:ctx.userId,
      action:'custom_field.save',
      entity:'custom_field_definition',
      entityId:data.id,
      metadata:{entity_type:input.entity_type,field_key:input.field_key}
    });

    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'custom_field_save_failed'},{status:500});
  }
}
