import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePublicApi } from '@/lib/server/public-api';
import { createAdminClient } from '@/lib/supabase/admin';

const schema=z.object({
  contact_id:z.string().uuid().optional().nullable(),
  deal_id:z.string().uuid().optional().nullable(),
  source:z.string().trim().min(1).max(80).default('external'),
  external_id:z.string().max(500).optional().nullable(),
  title:z.string().max(1000).optional().nullable(),
  transcript:z.string().min(1).max(200000),
  summary:z.string().max(20000).optional().nullable(),
  next_actions:z.array(z.unknown()).max(100).default([]),
  sentiment:z.string().max(80).optional().nullable(),
  started_at:z.string().datetime().optional().nullable(),
  duration_seconds:z.number().int().min(0).max(86400).optional().nullable(),
  metadata:z.record(z.unknown()).default({})
});

export async function GET(request:Request){
  try{
    const auth=await authenticatePublicApi(request,'transcripts:read');
    const admin=createAdminClient();
    const url=new URL(request.url);
    const contactId=url.searchParams.get('contact_id');
    let query=admin.from('interaction_transcripts')
      .select('id,contact_id,deal_id,source,external_id,title,summary,next_actions,sentiment,started_at,duration_seconds,metadata,created_at')
      .eq('tenant_id',auth.tenantId)
      .order('created_at',{ascending:false})
      .limit(200);
    if(contactId)query=query.eq('contact_id',contactId);
    const {data,error}=await query;
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'transcripts_fetch_failed'},{status:500});
  }
}

export async function POST(request:Request){
  try{
    const auth=await authenticatePublicApi(request,'transcripts:write');
    const input=schema.parse(await request.json());
    const admin=createAdminClient();
    let existingId:string|null=null;

    if(input.external_id){
      const {data}=await admin.from('interaction_transcripts').select('id')
        .eq('tenant_id',auth.tenantId).eq('source',input.source).eq('external_id',input.external_id)
        .limit(1).maybeSingle();
      existingId=data?.id??null;
    }

    const payload={tenant_id:auth.tenantId,...input};
    const result=existingId
      ? await admin.from('interaction_transcripts').update(payload).eq('tenant_id',auth.tenantId).eq('id',existingId).select().single()
      : await admin.from('interaction_transcripts').insert(payload).select().single();

    if(result.error)throw result.error;
    return NextResponse.json({data:result.data},{status:existingId?200:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'transcript_sync_failed'},{status:500});
  }
}
