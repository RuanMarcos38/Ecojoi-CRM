import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePublicApi } from '@/lib/server/public-api';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestLead } from '@/lib/server/lead-ingestion';

const schema=z.object({
  name:z.string().trim().min(2).max(140),
  email:z.string().email().optional().nullable(),
  phone:z.string().max(40).optional().nullable(),
  source:z.string().trim().max(80).optional().nullable(),
  status:z.enum(['lead','active','inactive']).default('lead'),
  external_id:z.string().trim().max(240).optional().nullable(),
  custom_fields:z.record(z.unknown()).optional().default({})
});

export async function GET(req:Request){
  try{
    const auth=await authenticatePublicApi(req,'contacts:read');
    const admin=createAdminClient();
    const url=new URL(req.url);
    const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')??50)||50));
    const {data,error}=await admin.from('contacts')
      .select('id,name,email,phone,source,status,owner_id,lead_score,lead_temperature,custom_fields,attribution,created_at,updated_at')
      .eq('tenant_id',auth.tenantId).order('created_at',{ascending:false}).limit(limit);
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'public_contacts_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const auth=await authenticatePublicApi(req,'contacts:write');
    const input=schema.parse(await req.json());
    const result=await ingestLead({
      tenantId:auth.tenantId,name:input.name,email:input.email,phone:input.phone,source:input.source||'API',
      channel:'external',externalId:input.external_id,externalName:input.name,createConversation:false
    });
    const admin=createAdminClient();
    if(result.contact?.id){
      await admin.from('contacts').update({status:input.status,custom_fields:input.custom_fields,updated_at:new Date().toISOString()})
        .eq('tenant_id',auth.tenantId).eq('id',result.contact.id);
    }
    const {data}=await admin.from('contacts').select('*').eq('tenant_id',auth.tenantId).eq('id',result.contact?.id).single();
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'public_contact_create_failed'},{status:500});
  }
}
