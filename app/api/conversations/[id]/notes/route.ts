import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const schema=z.object({body:z.string().trim().min(1).max(4000),mentions:z.array(z.string().uuid()).default([])});

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  try{const ctx=await requirePermission('conversations.view');const {id}=await params;const supabase=await createClient();
    const {data,error}=await supabase.from('conversation_notes').select('id,body,mentions,created_at,author:profiles(id,full_name)').eq('tenant_id',ctx.tenantId).eq('conversation_id',id).order('created_at');
    if(error)throw error;return NextResponse.json({data:data??[]});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'conversation_notes_fetch_failed'},{status:500});}
}

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{const ctx=await requirePermission('conversations.view');const {id}=await params;const body=schema.parse(await req.json());const supabase=await createClient();
    const {data:conv}=await supabase.from('conversations').select('id').eq('tenant_id',ctx.tenantId).eq('id',id).maybeSingle();
    if(!conv)return NextResponse.json({error:'not_found'},{status:404});
    const {data,error}=await supabase.from('conversation_notes').insert({tenant_id:ctx.tenantId,conversation_id:id,author_id:ctx.userId,...body}).select().single();
    if(error)throw error;
    if(body.mentions.length){
      await supabase.from('notifications').insert(body.mentions.map(user_id=>({tenant_id:ctx.tenantId,user_id,type:'mention',title:'Você foi mencionado em uma conversa',body:body.body.slice(0,240),entity_type:'conversation',entity_id:id,priority:'normal'})));
    }
    return NextResponse.json({data},{status:201});
  }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'conversation_note_create_failed'},{status:500});}
}
