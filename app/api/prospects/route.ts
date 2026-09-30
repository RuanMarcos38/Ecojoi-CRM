import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const schema=z.object({
  list_name:z.string().trim().max(120).optional().nullable(),
  company_name:z.string().trim().max(180).optional().nullable(),
  contact_name:z.string().trim().max(180).optional().nullable(),
  document:z.string().trim().max(60).optional().nullable(),
  website:z.string().trim().max(500).optional().nullable(),
  email:z.string().email().optional().nullable(),
  phone:z.string().trim().max(40).optional().nullable(),
  segment:z.string().trim().max(120).optional().nullable(),
  city:z.string().trim().max(120).optional().nullable(),
  state:z.string().trim().max(80).optional().nullable(),
  source:z.string().trim().max(120).optional().default('Prospecção'),
  status:z.enum(['new','researching','qualified','converted','discarded']).optional().default('new'),
  enrichment:z.record(z.unknown()).optional().default({})
}).refine(v=>Boolean(v.company_name||v.contact_name||v.email||v.phone),{message:'prospect_identity_required'});

export async function GET(){
  try{
    const ctx=await requirePermission('contacts.view');
    const supabase=await createClient();
    const {data,error}=await supabase.from('prospects')
      .select('id,list_name,company_name,contact_name,document,website,email,phone,segment,city,state,source,status,assigned_to,enrichment,converted_contact_id,created_at,updated_at,assignee:profiles!prospects_assigned_to_fkey(id,full_name)')
      .eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false}).limit(1000);
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'prospects_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('contacts.create');
    const input=schema.parse(await req.json());
    const supabase=await createClient();
    const {data,error}=await supabase.from('prospects').insert({
      tenant_id:ctx.tenantId,
      ...input,
      assigned_to:ctx.userId,
      created_by:ctx.userId
    }).select().single();
    if(error)throw error;
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'prospect.create',entity:'prospect',entityId:data.id,metadata:{source:input.source}});
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'prospect_create_failed'},{status:500});
  }
}
