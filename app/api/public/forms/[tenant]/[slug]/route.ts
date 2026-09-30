import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestLead } from '@/lib/server/lead-ingestion';

async function resolve(tenantSlug:string,formSlug:string){
  const admin=createAdminClient();
  const {data:tenant}=await admin.from('tenants').select('id').eq('slug',tenantSlug).eq('active',true).maybeSingle();
  if(!tenant)return null;
  const {data:form}=await admin.from('capture_forms')
    .select('id,tenant_id,slug,name,title,description,fields,source,success_message,active')
    .eq('tenant_id',tenant.id).eq('slug',formSlug).eq('active',true).maybeSingle();
  return form??null;
}

export async function GET(_:Request,{params}:{params:Promise<{tenant:string;slug:string}>}){
  const {tenant,slug}=await params;
  const form=await resolve(tenant,slug);
  if(!form)return NextResponse.json({error:'form_not_found'},{status:404});
  return NextResponse.json({data:{slug:form.slug,title:form.title,description:form.description,fields:form.fields,success_message:form.success_message}});
}

export async function POST(req:Request,{params}:{params:Promise<{tenant:string;slug:string}>}){
  try{
    const {tenant,slug}=await params;
    const form=await resolve(tenant,slug);
    if(!form)return NextResponse.json({error:'form_not_found'},{status:404});

    const payload=await req.json();
    const name=String(payload?.name??'').trim();
    if(name.length<2)return NextResponse.json({error:'name_required'},{status:400});
    const email=String(payload?.email??'').trim()||null;
    const phone=String(payload?.phone??'').trim()||null;

    const result=await ingestLead({
      tenantId:form.tenant_id,
      name,email,phone,
      source:form.source||'Formulário',
      channel:'external',
      externalId:null,
      attribution:{
        capture_form_id:form.id,
        utm_source:payload?.utm_source??null,
        utm_medium:payload?.utm_medium??null,
        utm_campaign:payload?.utm_campaign??null,
        utm_content:payload?.utm_content??null,
        utm_term:payload?.utm_term??null,
        gclid:payload?.gclid??null,
        fbclid:payload?.fbclid??null,
        landing_page:payload?.landing_page??null,
        referrer:payload?.referrer??null
      },
      createConversation:false
    });

    const admin=createAdminClient();
    const rawIp=(req.headers.get('x-forwarded-for')||'').split(',')[0].trim();
    const salt=process.env.PUBLIC_CAPTURE_HASH_SALT?.trim()||'';
    const ipHash=rawIp&&salt?createHash('sha256').update(salt+rawIp).digest('hex'):null;
    await admin.from('capture_form_submissions').insert({
      tenant_id:form.tenant_id,form_id:form.id,contact_id:result.contact?.id??null,
      payload,ip_hash:ipHash,user_agent:req.headers.get('user-agent')
    });

    return NextResponse.json({data:{success:true,message:form.success_message}},{status:201});
  }catch{
    return NextResponse.json({error:'form_submit_failed'},{status:500});
  }
}
