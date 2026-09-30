import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { audit } from '@/lib/server/audit';

const patch = z.object({
  name: z.string().min(2).max(140).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  source: z.string().max(80).nullable().optional(),
  status: z.enum(['lead','active','inactive']).optional(),
  organization_id: z.string().uuid().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
  consent_status: z.enum(['unknown','opt_in','opt_out']).optional(),
  lead_score: z.number().int().min(0).max(100).optional(),
  lead_temperature: z.enum(['cold','warm','hot']).optional()
});

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const ctx=await requirePermission('contacts.view');
    const {id}=await params;
    const supabase=await createClient();
    const {data,error}=await supabase
      .from('contacts')
      .select('*,owner:profiles!contacts_owner_id_fkey(id,full_name),organization:organizations!contacts_organization_id_fkey(id,name,legal_name,document,website,phone,email,segment,size),contact_tags(tag:tags(id,name,color))')
      .eq('id',id)
      .eq('tenant_id',ctx.tenantId)
      .maybeSingle();
    if(error)throw error;
    if(!data)return NextResponse.json({error:'not_found'},{status:404});
    return NextResponse.json({data});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'contact_fetch_failed'},{status:500});
  }
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const ctx=await requirePermission('contacts.update');
    const {id}=await params;
    const body=patch.parse(await req.json());
    const supabase=await createClient();

    if(body.organization_id){
      const {data:org}=await supabase.from('organizations').select('id').eq('tenant_id',ctx.tenantId).eq('id',body.organization_id).maybeSingle();
      if(!org)return NextResponse.json({error:'organization_not_found'},{status:404});
    }

    const update:any={...body,updated_at:new Date().toISOString()};
    if(body.consent_status && body.consent_status!=='unknown') update.consent_at=new Date().toISOString();

    const {data,error}=await supabase.from('contacts').update(update).eq('id',id).eq('tenant_id',ctx.tenantId).select().maybeSingle();
    if(error)throw error;
    if(!data)return NextResponse.json({error:'not_found'},{status:404});

    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'contact.update',entity:'contact',entityId:id,metadata:{fields:Object.keys(body)}});
    return NextResponse.json({data});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'contact_update_failed'},{status:500});
  }
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const ctx=await requirePermission('contacts.delete');
    const {id}=await params;
    const supabase=await createClient();
    const {data,error}=await supabase.from('contacts').delete().eq('id',id).eq('tenant_id',ctx.tenantId).select('id').maybeSingle();
    if(error)throw error;
    if(!data)return NextResponse.json({error:'not_found'},{status:404});
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'contact.delete',entity:'contact',entityId:id});
    return NextResponse.json({ok:true});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'contact_delete_failed'},{status:500});
  }
}
