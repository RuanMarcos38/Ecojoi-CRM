import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const schema=z.object({
  name:z.string().trim().min(2).max(180),
  legal_name:z.string().trim().max(220).optional().nullable(),
  document:z.string().trim().max(40).optional().nullable(),
  website:z.string().trim().max(500).optional().nullable(),
  phone:z.string().trim().max(40).optional().nullable(),
  email:z.string().email().optional().nullable(),
  segment:z.string().trim().max(100).optional().nullable(),
  size:z.string().trim().max(80).optional().nullable(),
  custom_fields:z.record(z.unknown()).optional().default({})
});

export async function GET(){
  try{
    const ctx=await requirePermission('contacts.view');
    const supabase=await createClient();
    const {data,error}=await supabase.from('organizations')
      .select('id,name,legal_name,document,website,phone,email,segment,size,custom_fields,created_at,updated_at')
      .eq('tenant_id',ctx.tenantId).order('name');
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'organizations_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('contacts.update');
    const body=schema.parse(await req.json());
    const supabase=await createClient();
    const {data,error}=await supabase.from('organizations')
      .insert({...body,tenant_id:ctx.tenantId}).select().single();
    if(error)throw error;
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'organization_create_failed'},{status:500});
  }
}
