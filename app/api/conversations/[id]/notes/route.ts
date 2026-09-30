import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const schema=z.object({
  body:z.string().trim().min(1).max(4000)
});

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const ctx=await requirePermission('conversations.view');
    const {id}=await params;
    const supabase=await createClient();

    const {data:conversation}=await supabase.from('conversations')
      .select('id').eq('tenant_id',ctx.tenantId).eq('id',id).maybeSingle();
    if(!conversation)return NextResponse.json({error:'not_found'},{status:404});

    const {data,error}=await supabase.from('conversation_notes')
      .select('id,body,created_at,user:profiles!conversation_notes_user_id_fkey(id,full_name)')
      .eq('tenant_id',ctx.tenantId)
      .eq('conversation_id',id)
      .order('created_at',{ascending:false})
      .limit(100);

    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'conversation_notes_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const ctx=await requirePermission('conversations.send');
    const {id}=await params;
    const input=schema.parse(await req.json());
    const supabase=await createClient();

    const {data:conversation}=await supabase.from('conversations')
      .select('id').eq('tenant_id',ctx.tenantId).eq('id',id).maybeSingle();
    if(!conversation)return NextResponse.json({error:'not_found'},{status:404});

    const {data,error}=await supabase.from('conversation_notes')
      .insert({
        tenant_id:ctx.tenantId,
        conversation_id:id,
        user_id:ctx.userId,
        body:input.body
      })
      .select('id,body,created_at')
      .single();

    if(error)throw error;
    await audit({
      tenantId:ctx.tenantId,
      userId:ctx.userId,
      action:'conversation.note.create',
      entity:'conversation',
      entityId:id
    });
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'conversation_note_create_failed'},{status:500});
  }
}
