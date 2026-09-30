import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  try{const ctx=await requirePermission('contacts.view');const {id}=await params;const admin=createAdminClient();
    const {data:contact}=await admin.from('contacts').select('*').eq('tenant_id',ctx.tenantId).eq('id',id).maybeSingle();
    if(!contact)return NextResponse.json({error:'not_found'},{status:404});
    const [{data:conversations},{data:deals},{data:tasks},{data:proposals},{data:tags}]=await Promise.all([
      admin.from('conversations').select('id,status,channel,attendance_state,created_at,updated_at,messages(id,direction,body,status,message_type,created_at)').eq('tenant_id',ctx.tenantId).eq('contact_id',id),
      admin.from('deals').select('*').eq('tenant_id',ctx.tenantId).eq('contact_id',id),
      admin.from('tasks').select('*').eq('tenant_id',ctx.tenantId).eq('related_contact_id',id),
      admin.from('proposals').select('*').eq('tenant_id',ctx.tenantId).eq('contact_id',id),
      admin.from('contact_tags').select('tag:tags(id,name,color)').eq('tenant_id',ctx.tenantId).eq('contact_id',id)
    ]);
    return NextResponse.json({data:{contact,conversations:conversations??[],deals:deals??[],tasks:tasks??[],proposals:proposals??[],tags:tags??[],exported_at:new Date().toISOString()}});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'privacy_export_failed'},{status:500});}
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  try{const ctx=await requirePermission('contacts.delete');const {id}=await params;const admin=createAdminClient();const supabase=await createClient();
    const {data:contact}=await admin.from('contacts').select('id').eq('tenant_id',ctx.tenantId).eq('id',id).maybeSingle();
    if(!contact)return NextResponse.json({error:'not_found'},{status:404});
    const anon=`anon-${id.slice(0,8)}`;
    await admin.from('contacts').update({name:'Titular anonimizado',email:null,phone:null,source:'LGPD',attribution:{},custom_fields:{},consent_status:'opt_out',consent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('tenant_id',ctx.tenantId).eq('id',id);
    await admin.from('contact_channels').delete().eq('tenant_id',ctx.tenantId).eq('contact_id',id);
    await admin.from('conversations').update({status:'closed',updated_at:new Date().toISOString()}).eq('tenant_id',ctx.tenantId).eq('contact_id',id);
    await supabase.from('audit_logs').insert({tenant_id:ctx.tenantId,user_id:ctx.userId,action:'contact.anonymize',entity:'contact',entity_id:id,metadata:{reference:anon}});
    return NextResponse.json({ok:true});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'privacy_anonymize_failed'},{status:500});}
}
