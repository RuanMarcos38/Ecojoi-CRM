import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePublicApi } from '@/lib/server/public-api';
import { createAdminClient } from '@/lib/supabase/admin';

const schema=z.object({
  contact_id:z.string().uuid(),
  channel:z.enum(['internal','whatsapp','instagram','facebook','email']).default('internal')
});

export async function GET(req:Request){
  try{
    const auth=await authenticatePublicApi(req,'conversations:read');
    const admin=createAdminClient();
    const {data,error}=await admin.from('conversations')
      .select('id,status,channel,contact_id,assigned_to,attendance_state,last_inbound_at,last_outbound_at,first_response_at,sla_due_at,created_at,updated_at,contact:contacts(id,name,email,phone,source)')
      .eq('tenant_id',auth.tenantId).order('updated_at',{ascending:false}).limit(200);
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'public_conversations_fetch_failed'},{status:500});}
}

export async function POST(req:Request){
  try{
    const auth=await authenticatePublicApi(req,'conversations:write');
    const input=schema.parse(await req.json());
    const admin=createAdminClient();
    const {data:contact}=await admin.from('contacts').select('id,owner_id').eq('tenant_id',auth.tenantId).eq('id',input.contact_id).maybeSingle();
    if(!contact)return NextResponse.json({error:'contact_not_found'},{status:404});
    const {data,error}=await admin.from('conversations').insert({
      tenant_id:auth.tenantId,contact_id:input.contact_id,channel:input.channel,status:'open',
      assigned_to:contact.owner_id??null,attendance_state:contact.owner_id?'in_service':'waiting',attendance_changed_at:new Date().toISOString()
    }).select().single();
    if(error)throw error;
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'public_conversation_create_failed'},{status:500});
  }
}
