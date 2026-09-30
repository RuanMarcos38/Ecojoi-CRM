import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestLead } from '@/lib/server/lead-ingestion';

const schema=z.object({name:z.string().trim().min(2).max(140),email:z.string().email().optional().nullable(),phone:z.string().max(40).optional().nullable(),message:z.string().trim().min(1).max(4000),session_id:z.string().max(120).optional().nullable(),page_url:z.string().url().max(2000).optional().nullable()});

function allowed(origin:string|null,allowed:string[]){if(!allowed.length)return true;if(!origin)return false;return allowed.some(v=>origin===v||origin.endsWith(v));}

export async function GET(req:Request,{params}:{params:Promise<{key:string}>}){
  const {key}=await params;const admin=createAdminClient();const {data}=await admin.from('webchat_widgets').select('name,welcome_message,accent_color,allowed_origins,active').eq('public_key',key).maybeSingle();
  if(!data?.active)return NextResponse.json({error:'widget_not_found'},{status:404});
  if(!allowed(req.headers.get('origin'),data.allowed_origins??[]))return NextResponse.json({error:'origin_not_allowed'},{status:403});
  return NextResponse.json({data:{name:data.name,welcome_message:data.welcome_message,accent_color:data.accent_color}});
}

export async function POST(req:Request,{params}:{params:Promise<{key:string}>}){
  try{const {key}=await params;const body=schema.parse(await req.json());const admin=createAdminClient();const {data:widget}=await admin.from('webchat_widgets').select('tenant_id,allowed_origins,active,name').eq('public_key',key).maybeSingle();
    if(!widget?.active)return NextResponse.json({error:'widget_not_found'},{status:404});
    if(!allowed(req.headers.get('origin'),widget.allowed_origins??[]))return NextResponse.json({error:'origin_not_allowed'},{status:403});
    const lead=await ingestLead({tenantId:widget.tenant_id,name:body.name,email:body.email,phone:body.phone,source:'Chat do site',channel:'external',externalId:body.session_id||null,externalName:body.name,message:body.message,attribution:{landing_page:body.page_url??null,webchat:widget.name},createConversation:true});
    return NextResponse.json({data:{contact_id:lead.contact?.id,conversation_id:lead.conversationId}},{status:201});
  }catch(e){if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'webchat_message_failed'},{status:500});}
}
