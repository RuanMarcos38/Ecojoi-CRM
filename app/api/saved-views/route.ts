import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const schema=z.object({
  entity_type:z.enum(['contacts','leads','deals','tasks','conversations']),
  name:z.string().trim().min(1).max(120),
  filters:z.record(z.unknown()).default({}),
  columns:z.array(z.unknown()).default([]),
  is_default:z.boolean().default(false)
});

export async function GET(req:Request){
  try{
    const ctx=await requirePermission('contacts.view');
    const supabase=await createClient();
    const entity=new URL(req.url).searchParams.get('entity');
    let query=supabase.from('saved_views').select('id,entity_type,name,filters,columns,is_default,created_at,updated_at')
      .eq('tenant_id',ctx.tenantId).eq('user_id',ctx.userId).order('name');
    if(entity)query=query.eq('entity_type',entity);
    const {data,error}=await query;
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'saved_views_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('contacts.view');
    const input=schema.parse(await req.json());
    const supabase=await createClient();
    if(input.is_default){
      await supabase.from('saved_views').update({is_default:false})
        .eq('tenant_id',ctx.tenantId).eq('user_id',ctx.userId).eq('entity_type',input.entity_type);
    }
    const {data,error}=await supabase.from('saved_views').upsert({
      tenant_id:ctx.tenantId,user_id:ctx.userId,...input,updated_at:new Date().toISOString()
    },{onConflict:'tenant_id,user_id,entity_type,name'}).select().single();
    if(error)throw error;
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'saved_view_save_failed'},{status:500});
  }
}
