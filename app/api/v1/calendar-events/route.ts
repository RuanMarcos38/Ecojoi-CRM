import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePublicApi } from '@/lib/server/public-api';
import { createAdminClient } from '@/lib/supabase/admin';

const schema=z.object({
  contact_id:z.string().uuid().optional().nullable(),
  connection_id:z.string().uuid().optional().nullable(),
  provider_event_id:z.string().trim().min(1).max(500),
  calendar_id:z.string().max(500).optional().nullable(),
  title:z.string().trim().min(1).max(1000),
  description:z.string().max(10000).optional().nullable(),
  starts_at:z.string().datetime(),
  ends_at:z.string().datetime(),
  location:z.string().max(1000).optional().nullable(),
  organizer_email:z.string().max(320).optional().nullable(),
  attendees:z.array(z.record(z.unknown())).max(500).default([]),
  meeting_url:z.string().url().max(2000).optional().nullable(),
  status:z.string().max(80).default('confirmed'),
  metadata:z.record(z.unknown()).default({}),
  provider_updated_at:z.string().datetime().optional().nullable()
});

export async function GET(request:Request){
  try{
    const auth=await authenticatePublicApi(request,'calendar:read');
    const admin=createAdminClient();
    const url=new URL(request.url);
    const contactId=url.searchParams.get('contact_id');
    const from=url.searchParams.get('from');
    const to=url.searchParams.get('to');

    let query=admin.from('external_calendar_events')
      .select('id,contact_id,connection_id,provider_event_id,calendar_id,title,description,starts_at,ends_at,location,organizer_email,attendees,meeting_url,status,metadata,provider_updated_at,created_at,updated_at')
      .eq('tenant_id',auth.tenantId)
      .order('starts_at',{ascending:true})
      .limit(300);

    if(contactId)query=query.eq('contact_id',contactId);
    if(from)query=query.gte('starts_at',from);
    if(to)query=query.lte('starts_at',to);
    const {data,error}=await query;
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'calendar_events_fetch_failed'},{status:500});
  }
}

export async function POST(request:Request){
  try{
    const auth=await authenticatePublicApi(request,'calendar:write');
    const input=schema.parse(await request.json());
    const admin=createAdminClient();

    let query=admin.from('external_calendar_events').select('id')
      .eq('tenant_id',auth.tenantId)
      .eq('provider_event_id',input.provider_event_id);
    if(input.connection_id)query=query.eq('connection_id',input.connection_id);
    else query=query.is('connection_id',null);
    const {data:existing}=await query.limit(1).maybeSingle();

    const payload={tenant_id:auth.tenantId,...input,updated_at:new Date().toISOString()};
    const result=existing?.id
      ? await admin.from('external_calendar_events').update(payload).eq('tenant_id',auth.tenantId).eq('id',existing.id).select().single()
      : await admin.from('external_calendar_events').insert(payload).select().single();

    if(result.error)throw result.error;
    return NextResponse.json({data:result.data},{status:existing?.id?200:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'calendar_event_sync_failed'},{status:500});
  }
}
