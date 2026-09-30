import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePublicApi } from '@/lib/server/public-api';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppText } from '@/lib/server/meta';
import { enqueueOutbound } from '@/lib/server/outbound-queue';

const schema=z.object({body:z.string().trim().min(1).max(4000)});

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const auth=await authenticatePublicApi(req,'conversations:read');
    const {id}=await params;
    const admin=createAdminClient();
    const {data:conversation}=await admin.from('conversations').select('id').eq('tenant_id',auth.tenantId).eq('id',id).maybeSingle();
    if(!conversation)return NextResponse.json({error:'conversation_not_found'},{status:404});
    const {data,error}=await admin.from('messages')
      .select('id,direction,body,status,message_type,attachment_name,attachment_mime,attachment_size,provider_message_id,created_at')
      .eq('tenant_id',auth.tenantId).eq('conversation_id',id).order('created_at').limit(500);
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'public_messages_fetch_failed'},{status:500});}
}

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const auth=await authenticatePublicApi(req,'messages:write');
    const {id}=await params;
    const input=schema.parse(await req.json());
    const admin=createAdminClient();
    const {data:conversation}=await admin.from('conversations')
      .select('id,channel,contact:contacts(phone)')
      .eq('tenant_id',auth.tenantId).eq('id',id).maybeSingle();
    if(!conversation)return NextResponse.json({error:'conversation_not_found'},{status:404});

    const initialStatus=conversation.channel==='internal'?'sent':'queued';
    const {data:message,error}=await admin.from('messages').insert({
      tenant_id:auth.tenantId,conversation_id:id,direction:'outbound',body:input.body,status:initialStatus,message_type:'text'
    }).select().single();
    if(error)throw error;

    let delivery=initialStatus;
    if(conversation.channel==='whatsapp'){
      const contact=Array.isArray(conversation.contact)?conversation.contact[0]:conversation.contact;
      const sent=await sendWhatsAppText(auth.tenantId,contact?.phone,input.body);
      if(sent.delivered){
        delivery='sent';
        await admin.from('messages').update({status:'sent',provider_message_id:sent.providerMessageId??null}).eq('id',message.id);
      }else if(contact?.phone){
        await enqueueOutbound({
          tenantId:auth.tenantId,conversationId:id,messageId:message.id,channel:'whatsapp',
          payload:{kind:'text',to:contact.phone,body:input.body},error:sent.reason
        });
      }
    }
    await admin.from('conversations').update({updated_at:new Date().toISOString()}).eq('tenant_id',auth.tenantId).eq('id',id);
    return NextResponse.json({data:{...message,status:delivery},delivery},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'public_message_send_failed'},{status:500});
  }
}
