import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePublicApi } from '@/lib/server/public-api';
import { createAdminClient } from '@/lib/supabase/admin';

const schema=z.object({
  title:z.string().trim().min(2).max(180),
  stage:z.enum(['new','qualification','proposal','closing','won','lost']).default('new'),
  value:z.coerce.number().min(0).default(0),
  probability:z.coerce.number().int().min(0).max(100).default(10),
  contact_id:z.string().uuid().optional().nullable(),
  owner_id:z.string().uuid().optional().nullable()
});

export async function GET(req:Request){
  try{
    const auth=await authenticatePublicApi(req,'deals:read');
    const admin=createAdminClient();
    const {data,error}=await admin.from('deals')
      .select('id,title,stage,value,probability,contact_id,owner_id,stage_changed_at,created_at,updated_at,contact:contacts(id,name,email,phone)')
      .eq('tenant_id',auth.tenantId).order('created_at',{ascending:false}).limit(200);
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'public_deals_fetch_failed'},{status:500});}
}

export async function POST(req:Request){
  try{
    const auth=await authenticatePublicApi(req,'deals:write');
    const input=schema.parse(await req.json());
    const admin=createAdminClient();
    if(input.contact_id){
      const {data}=await admin.from('contacts').select('id').eq('tenant_id',auth.tenantId).eq('id',input.contact_id).maybeSingle();
      if(!data)return NextResponse.json({error:'contact_not_found'},{status:404});
    }
    if(input.owner_id){
      const {data}=await admin.from('profiles').select('id').eq('tenant_id',auth.tenantId).eq('id',input.owner_id).eq('active',true).maybeSingle();
      if(!data)return NextResponse.json({error:'owner_not_found'},{status:404});
    }
    const {data,error}=await admin.from('deals').insert({
      tenant_id:auth.tenantId,...input,stage_changed_at:new Date().toISOString()
    }).select().single();
    if(error)throw error;
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'public_deal_create_failed'},{status:500});
  }
}
