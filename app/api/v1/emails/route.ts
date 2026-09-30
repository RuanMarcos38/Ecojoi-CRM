import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePublicApi } from '@/lib/server/public-api';
import { createAdminClient } from '@/lib/supabase/admin';

const schema=z.object({
  contact_id:z.string().uuid().optional().nullable(),
  connection_id:z.string().uuid().optional().nullable(),
  provider_message_id:z.string().trim().min(1).max(500),
  thread_id:z.string().trim().max(500).optional().nullable(),
  direction:z.enum(['inbound','outbound']),
  subject:z.string().max(1000).optional().nullable(),
  snippet:z.string().max(4000).optional().nullable(),
  from_address:z.string().max(320).optional().nullable(),
  to_addresses:z.array(z.string().max(320)).max(100).default([]),
  cc_addresses:z.array(z.string().max(320)).max(100).default([]),
  sent_at:z.string().datetime().optional().nullable(),
  metadata:z.record(z.unknown()).default({})
});

export async function GET(request:Request){
  try{
    const auth=await authenticatePublicApi(request,'emails:read');
    const admin=createAdminClient();
    const url=new URL(request.url);
    const contactId=url.searchParams.get('contact_id');
    let query=admin.from('external_emails')
      .select('id,contact_id,connection_id,provider_message_id,thread_id,direction,subject,snippet,from_address,to_addresses,cc_addresses,sent_at,metadata,created_at')
      .eq('tenant_id',auth.tenantId)
      .order('sent_at',{ascending:false,nullsFirst:false})
      .limit(200);
    if(contactId)query=query.eq('contact_id',contactId);
    const {data,error}=await query;
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'external_emails_fetch_failed'},{status:500});
  }
}

export async function POST(request:Request){
  try{
    const auth=await authenticatePublicApi(request,'emails:write');
    const input=schema.parse(await request.json());
    const admin=createAdminClient();

    const {data:existing}=await admin.from('external_emails').select('id')
      .eq('tenant_id',auth.tenantId)
      .eq('provider_message_id',input.provider_message_id)
      .limit(1).maybeSingle();

    const payload={tenant_id:auth.tenantId,...input};
    const result=existing?.id
      ? await admin.from('external_emails').update(payload).eq('tenant_id',auth.tenantId).eq('id',existing.id).select().single()
      : await admin.from('external_emails').insert(payload).select().single();

    if(result.error)throw result.error;
    return NextResponse.json({data:result.data},{status:existing?.id?200:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'external_email_sync_failed'},{status:500});
  }
}
