import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const schema=z.object({tag_id:z.string().uuid()});

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const ctx=await requirePermission('contacts.update');
    const {id}=await params;
    const {tag_id}=schema.parse(await req.json());
    const supabase=await createClient();
    const [{data:contact},{data:tag}]=await Promise.all([
      supabase.from('contacts').select('id').eq('tenant_id',ctx.tenantId).eq('id',id).maybeSingle(),
      supabase.from('tags').select('id').eq('tenant_id',ctx.tenantId).eq('id',tag_id).maybeSingle()
    ]);
    if(!contact||!tag)return NextResponse.json({error:'not_found'},{status:404});
    const {error}=await supabase.from('contact_tags').upsert({tenant_id:ctx.tenantId,contact_id:id,tag_id},{onConflict:'contact_id,tag_id'});
    if(error)throw error;
    return NextResponse.json({ok:true},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'contact_tag_add_failed'},{status:500});
  }
}

export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const ctx=await requirePermission('contacts.update');
    const {id}=await params;
    const {tag_id}=schema.parse(await req.json());
    const supabase=await createClient();
    const {error}=await supabase.from('contact_tags').delete().eq('tenant_id',ctx.tenantId).eq('contact_id',id).eq('tag_id',tag_id);
    if(error)throw error;
    return NextResponse.json({ok:true});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'contact_tag_remove_failed'},{status:500});
  }
}
