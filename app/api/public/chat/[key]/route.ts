import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestLead } from '@/lib/server/lead-ingestion';

async function widget(key:string){
  const admin=createAdminClient();
  const {data}=await admin.from('webchat_widgets')
    .select('id,tenant_id,public_key,name,welcome_message,active')
    .eq('public_key',key).eq('active',true).maybeSingle();
  return data??null;
}

export async function GET(req:Request,{params}:{params:Promise<{key:string}>}){
  const {key}=await params;
  const w=await widget(key);
  if(!w)return NextResponse.json({error:'widget_not_found'},{status:404});
  const token=new URL(req.url).searchParams.get('session');
  if(!token)return NextResponse.json({data:{name:w.name,welcome_message:w.welcome_message,messages:[]}});
  const admin=createAdminClient();
  const {data:session}=await admin.from('webchat_sessions').select('id,session_token,status')
    .eq('widget_id',w.id).eq('session_token',token).maybeSingle();
  if(!session)return NextResponse.json({error:'session_not_found'},{status:404});
  const {data:messages}=await admin.from('webchat_messages').select('id,direction,body,created_at')
    .eq('session_id',session.id).order('created_at');
  return NextResponse.json({data:{name:w.name,welcome_message:w.welcome_message,session:session.session_token,status:session.status,messages:messages??[]}});
}

export async function POST(req:Request,{params}:{params:Promise<{key:string}>}){
  try{
    const {key}=await params;
    const w=await widget(key);
    if(!w)return NextResponse.json({error:'widget_not_found'},{status:404});
    const input=await req.json();
    const admin=createAdminClient();
    const existingToken=String(input?.session??'').trim();
    let session:any=null;

    if(existingToken){
      const {data}=await admin.from('webchat_sessions').select('id,session_token,contact_id,status')
        .eq('tenant_id',w.tenant_id).eq('widget_id',w.id).eq('session_token',existingToken).eq('status','open').maybeSingle();
      session=data;
    }

    if(!session){
      const name=String(input?.name??'Visitante').trim()||'Visitante';
      const email=String(input?.email??'').trim()||null;
      const phone=String(input?.phone??'').trim()||null;
      const lead=await ingestLead({
        tenantId:w.tenant_id,name,email,phone,source:'Chat do site',
        channel:'external',attribution:{webchat_widget_id:w.id},createConversation:true
      });
      const {data,error}=await admin.from('webchat_sessions').insert({
        tenant_id:w.tenant_id,widget_id:w.id,contact_id:lead.contact?.id??null,
        visitor_name:name,visitor_email:email,visitor_phone:phone,status:'open'
      }).select('id,session_token,contact_id,status').single();
      if(error)throw error;
      session=data;
    }

    const body=String(input?.body??'').trim();
    if(body){
      await admin.from('webchat_messages').insert({
        tenant_id:w.tenant_id,session_id:session.id,direction:'visitor',body
      });
    }

    const {data:messages}=await admin.from('webchat_messages').select('id,direction,body,created_at')
      .eq('session_id',session.id).order('created_at');
    return NextResponse.json({data:{session:session.session_token,messages:messages??[]}},{status:201});
  }catch{
    return NextResponse.json({error:'webchat_message_failed'},{status:500});
  }
}
