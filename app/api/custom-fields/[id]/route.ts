import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const patch=z.object({
  label:z.string().trim().min(1).max(120).optional(),
  options:z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  required:z.boolean().optional(),
  active:z.boolean().optional(),
  sort_order:z.coerce.number().int().min(0).max(10000).optional()
});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const ctx=await requirePermission('settings.manage');
    const {id}=await params;
    const input=patch.parse(await request.json());
    const supabase=await createClient();
    const {data,error}=await supabase.from('custom_field_definitions')
      .update({...input,updated_at:new Date().toISOString()})
      .eq('tenant_id',ctx.tenantId).eq('id',id).select().maybeSingle();
    if(error)throw error;
    if(!data)return NextResponse.json({error:'not_found'},{status:404});
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'custom_field.update',entity:'custom_field_definition',entityId:id,metadata:input});
    return NextResponse.json({data});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'custom_field_update_failed'},{status:500});
  }
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const ctx=await requirePermission('settings.manage');
    const {id}=await params;
    const supabase=await createClient();
    const {data,error}=await supabase.from('custom_field_definitions')
      .update({active:false,updated_at:new Date().toISOString()})
      .eq('tenant_id',ctx.tenantId).eq('id',id).select('id').maybeSingle();
    if(error)throw error;
    if(!data)return NextResponse.json({error:'not_found'},{status:404});
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'custom_field.disable',entity:'custom_field_definition',entityId:id});
    return NextResponse.json({ok:true});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'custom_field_disable_failed'},{status:500});
  }
}
