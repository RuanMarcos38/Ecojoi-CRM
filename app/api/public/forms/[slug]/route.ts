import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestLead } from '@/lib/server/lead-ingestion';
import { createHash } from 'node:crypto';

const bodySchema=z.object({
  name:z.string().trim().min(2).max(140),
  email:z.string().email().optional().nullable(),
  phone:z.string().max(40).optional().nullable(),
  message:z.string().max(4000).optional().nullable(),
  attribution:z.record(z.unknown()).optional().default({}),
  extra:z.record(z.unknown()).optional().default({})
});

export async function GET(_:Request,{params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;const admin=createAdminClient();
  const {data,error}=await admin.from('public_forms').select('id,name,fields,success_message,active,source').eq('slug',slug).maybeSingle();
  if(error||!data||!data.active)return NextResponse.json({error:'form_not_found'},{status:404});
  return NextResponse.json({data:{name:data.name,fields:data.fields,success_message:data.success_message}});
}
export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){
  try{const {slug}=await params;const body=bodySchema.parse(await req.json());const admin=createAdminClient();
    const {data:form}=await admin.from('public_forms').select('id,tenant_id,source,active,success_message').eq('slug',slug).maybeSingle();
    if(!form||!form.active)return NextResponse.json({error:'form_not_found'},{status:404});
    const lead=await ingestLead({tenantId:form.tenant_id,name:body.name,email:body.email,phone:body.phone,source:form.source||'Formulário',channel:'external',externalName:body.name,message:body.message,attribution:body.attribution,createConversation:Boolean(body.message)});
    const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'';
    const ipHash=ip?createHash('sha256').update(ip).digest('hex'):null;
    await admin.from('form_submissions').insert({tenant_id:form.tenant_id,form_id:form.id,contact_id:lead.contact?.id??null,payload:{...body,extra:body.extra},source_ip_hash:ipHash});
    return NextResponse.json({ok:true,message:form.success_message||'Recebemos seus dados.'},{status:201});
  }catch(e){if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'form_submit_failed'},{status:500});}
}
