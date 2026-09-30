import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/context';
import { isWhatsAppWindowOpen,sendWhatsAppText } from '@/lib/server/meta';

async function executeOne(tenantId:string,enrollment:any,step:any){
  const admin=createAdminClient();
  const {data:contact}=await admin.from('contacts').select('id,name,email,phone,owner_id').eq('tenant_id',tenantId).eq('id',enrollment.contact_id).maybeSingle();
  if(!contact)throw new Error('contact_not_found');
  const body=String(step.body||'').replace(/{{nome}}/g,contact.name??'').replace(/{{email}}/g,contact.email??'').replace(/{{telefone}}/g,contact.phone??'');

  if(step.action_type==='task'){
    await admin.from('tasks').insert({tenant_id:tenantId,title:step.subject||'Ação da sequência',description:body,status:'pending',priority:'medium',assigned_to:enrollment.owner_id??contact.owner_id,related_contact_id:contact.id,due_at:new Date().toISOString()});
  }else if(step.action_type==='internal_message'){
    await admin.from('notifications').insert({tenant_id:tenantId,user_id:enrollment.owner_id??contact.owner_id,type:'sequence',title:step.subject||'Sequência comercial',body,entity_type:'contact',entity_id:contact.id,priority:'normal'});
  }else if(step.action_type==='whatsapp'){
    const {data:conversation}=await admin.from('conversations').select('id,last_inbound_at').eq('tenant_id',tenantId).eq('contact_id',contact.id).eq('channel','whatsapp').neq('status','closed').order('updated_at',{ascending:false}).limit(1).maybeSingle();
    if(!conversation||!isWhatsAppWindowOpen(conversation.last_inbound_at)){
      await admin.from('tasks').insert({tenant_id:tenantId,title:'WhatsApp fora da janela de 24h',description:'Use um template aprovado para '+contact.name+'.\n\n'+body,status:'pending',priority:'high',assigned_to:enrollment.owner_id??contact.owner_id,related_contact_id:contact.id,due_at:new Date().toISOString()});
    }else{
      const sent=await sendWhatsAppText(tenantId,contact.phone,body);
      await admin.from('messages').insert({tenant_id:tenantId,conversation_id:conversation.id,direction:'outbound',body,status:sent.delivered?'sent':'queued',message_type:'text',provider_message_id:sent.delivered?sent.providerMessageId??null:null});
    }
  }else if(step.action_type==='email'){
    const endpoint=process.env.N8N_EMAIL_WEBHOOK_URL?.trim();
    if(endpoint){
      const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(process.env.N8N_WEBHOOK_TOKEN?{authorization:'Bearer '+process.env.N8N_WEBHOOK_TOKEN}:{})},body:JSON.stringify({event:'ecojoi.sequence.email',tenant_id:tenantId,contact,subject:step.subject||'',body}),signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('email_webhook_http_'+response.status);
    }else{
      await admin.from('tasks').insert({tenant_id:tenantId,title:'Enviar e-mail - '+(step.subject||'Sequência'),description:body,status:'pending',priority:'medium',assigned_to:enrollment.owner_id??contact.owner_id,related_contact_id:contact.id,due_at:new Date().toISOString()});
    }
  }
}

export async function POST(req:Request){
  let tenantId='';
  try{
    const cron=process.env.AUTOMATION_CRON_SECRET?.trim();
    const authorization=req.headers.get('authorization')??'';
    if(cron&&authorization==='Bearer '+cron){
      tenantId=new URL(req.url).searchParams.get('tenant_id')??'';
      if(!tenantId)return NextResponse.json({error:'tenant_id_required'},{status:400});
    }else{
      const ctx=await requirePermission('automations.manage');
      tenantId=ctx.tenantId;
    }

    const admin=createAdminClient();
    const {data:enrollments,error}=await admin.from('sequence_enrollments').select('*').eq('tenant_id',tenantId).eq('status','active').lte('next_run_at',new Date().toISOString()).order('next_run_at').limit(50);
    if(error)throw error;
    let processed=0,failed=0;
    for(const enrollment of enrollments??[]){
      try{
        const {data:step}=await admin.from('sequence_steps').select('*').eq('tenant_id',tenantId).eq('sequence_id',enrollment.sequence_id).eq('position',enrollment.current_position).maybeSingle();
        if(!step){await admin.from('sequence_enrollments').update({status:'completed',updated_at:new Date().toISOString()}).eq('id',enrollment.id);continue;}
        await executeOne(tenantId,enrollment,step);
        const nextPosition=Number(enrollment.current_position)+1;
        const {data:nextStep}=await admin.from('sequence_steps').select('delay_minutes').eq('tenant_id',tenantId).eq('sequence_id',enrollment.sequence_id).eq('position',nextPosition).maybeSingle();
        await admin.from('sequence_enrollments').update({
          current_position:nextPosition,
          status:nextStep?'active':'completed',
          last_run_at:new Date().toISOString(),
          next_run_at:new Date(Date.now()+Number(nextStep?.delay_minutes??0)*60000).toISOString(),
          updated_at:new Date().toISOString()
        }).eq('id',enrollment.id);
        processed++;
      }catch{failed++;}
    }
    return NextResponse.json({data:{processed,failed}});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'sequence_runner_failed'},{status:500});}
}
