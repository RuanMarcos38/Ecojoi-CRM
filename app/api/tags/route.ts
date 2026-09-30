import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const schema=z.object({name:z.string().trim().min(1).max(80),color:z.string().trim().max(30).optional().nullable()});

export async function GET(){
  try{
    const ctx=await requirePermission('contacts.view');
    const supabase=await createClient();
    const {data,error}=await supabase.from('tags').select('id,name,color,created_at').eq('tenant_id',ctx.tenantId).order('name');
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'tags_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('contacts.update');
    const body=schema.parse(await req.json());
    const supabase=await createClient();
    const {data,error}=await supabase.from('tags').upsert({tenant_id:ctx.tenantId,...body},{onConflict:'tenant_id,name'}).select().single();
    if(error)throw error;
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'tag_save_failed'},{status:500});
  }
}
