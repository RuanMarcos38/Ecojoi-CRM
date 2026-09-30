import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const schema=z.object({
  slug:z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  name:z.string().trim().min(2).max(120),
  owner_id:z.string().uuid().optional().nullable(),
  duration_minutes:z.coerce.number().int().min(10).max(480).default(30),
  timezone:z.string().trim().min(2).max(80).default('America/Sao_Paulo'),
  buffer_minutes:z.coerce.number().int().min(0).max(240).default(0),
  active:z.boolean().default(true)
});

export async function GET(){
  try{
    const ctx=await requirePermission('tasks.view');
    const supabase=await createClient();
    const {data,error}=await supabase.from('booking_links')
      .select('id,slug,name,owner_id,duration_minutes,timezone,working_hours,buffer_minutes,active,created_at,owner:profiles!booking_links_owner_id_fkey(id,full_name)')
      .eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false});
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'booking_links_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('settings.manage');
    const input=schema.parse(await req.json());
    const supabase=await createClient();
    if(input.owner_id){
      const {data:owner}=await supabase.from('profiles').select('id').eq('tenant_id',ctx.tenantId).eq('id',input.owner_id).maybeSingle();
      if(!owner)return NextResponse.json({error:'owner_not_found'},{status:404});
    }
    const {data,error}=await supabase.from('booking_links')
      .insert({tenant_id:ctx.tenantId,...input}).select().single();
    if(error)throw error;
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'booking_link.create',entity:'booking_link',entityId:data.id});
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'booking_link_create_failed'},{status:500});
  }
}
