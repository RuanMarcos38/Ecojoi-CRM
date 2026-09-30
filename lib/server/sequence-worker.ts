import { createAdminClient } from '@/lib/supabase/admin';
import { enqueueOutbound } from '@/lib/server/outbound-queue';

async function ensureWhatsAppConversation(tenantId:string,contact:any){
  const admin=createAdminClient();
  const {data:existing}=await admin.from('conversations').select('id,channel,status')
    .eq('tenant_id',tenantId).eq('contact_id',contact.id).eq('channel','whatsapp').neq('status','closed')
    .order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(existing?.id)return existing.id as string;
  const {data,error}=await admin.from('conversations').insert({
    tenant_id:tenantId,contact_id:contact.id,channel:'whatsapp',status:'open',
    assigned_to:contact.owner_id??null,attendance_state:contact.owner_id?'in_service':'waiting',attendance_changed_at:new Date().toISOString()
  }).select('id').single();
  if(error)throw error;
  return data.id as string;
}

export async function processSalesSequences(limit=25,tenantId?:string){
  const admin=createAdminClient();
  let query=admin.from('sales_sequence_enrollments')
    .select('id,tenant_id,sequence_id,contact_id,current_step,status,next_run_at')
    .eq('status','active').lte('next_run_at',new Date().toISOString())
    .order('next_run_at',{ascending:true}).limit(Math.min(100,Math.max(1,limit)));
  if(tenantId)query=query.eq('tenant_id',tenantId);
  const {data:enrollments,error}=await query;
  if(error)throw error;

  let succeeded=0,failed=0,completed=0;
  for(const enrollment of enrollments??[]){
    try{
      const nextOrder=Number(enrollment.current_step??0)+1;
      const [{data:step},{data:contact}]=await Promise.all([
        admin.from('sales_sequence_steps').select('id,step_order,delay_minutes,action_type,template_body')
          .eq('tenant_id',enrollment.tenant_id).eq('sequence_id',enrollment.sequence_id).eq('step_order',nextOrder).maybeSingle(),
        admin.from('contacts').select('id,name,email,phone,owner_id').eq('tenant_id',enrollment.tenant_id).eq('id',enrollment.contact_id).maybeSingle()
      ]);

      if(!step||!contact){
        await admin.from('sales_sequence_enrollments').update({status:'completed',next_run_at:null,last_error:null,updated_at:new Date().toISOString()}).eq('id',enrollment.id);
        completed++;continue;
      }

      const body=String(step.template_body??'').trim();
      if(step.action_type==='task'){
        await admin.from('tasks').insert({
          tenant_id:enrollment.tenant_id,title:body||`Follow-up - ${contact.name}`,
          description:body||'Etapa automática da sequência comercial.',status:'pending',priority:'medium',
          assigned_to:contact.owner_id??null,related_contact_id:contact.id
        });
      }else if(step.action_type==='email'){
        await admin.from('tasks').insert({
          tenant_id:enrollment.tenant_id,title:`Enviar e-mail - ${contact.name}`,
          description:body||'Etapa de e-mail aguardando provedor de e-mail conectado.',status:'pending',priority:'medium',
          assigned_to:contact.owner_id??null,related_contact_id:contact.id
        });
      }else if(step.action_type==='internal_note'){
        await admin.from('notifications').insert({
          tenant_id:enrollment.tenant_id,user_id:contact.owner_id??null,type:'sequence_internal_note',
          title:`Sequência: ${contact.name}`,body:body||'Executar próxima ação comercial.',entity_type:'contact',entity_id:contact.id,priority:'normal'
        });
      }else if(step.action_type==='whatsapp'){
        if(!contact.phone)throw new Error('contact_phone_missing');
        const conversationId=await ensureWhatsAppConversation(enrollment.tenant_id,contact);
        const {data:message,error:messageError}=await admin.from('messages').insert({
          tenant_id:enrollment.tenant_id,conversation_id:conversationId,direction:'outbound',
          body:body||'Olá! Podemos continuar nosso atendimento?',status:'queued',message_type:'text'
        }).select('id').single();
        if(messageError)throw messageError;
        await enqueueOutbound({
          tenantId:enrollment.tenant_id,conversationId,messageId:message.id,channel:'whatsapp',
          payload:{kind:'text',to:contact.phone,body:body||'Olá! Podemos continuar nosso atendimento?'}
        });
      }

      const {data:following}=await admin.from('sales_sequence_steps').select('step_order,delay_minutes')
        .eq('tenant_id',enrollment.tenant_id).eq('sequence_id',enrollment.sequence_id).eq('step_order',nextOrder+1).maybeSingle();
      if(following){
        await admin.from('sales_sequence_enrollments').update({
          current_step:nextOrder,next_run_at:new Date(Date.now()+Number(following.delay_minutes??0)*60000).toISOString(),
          last_error:null,updated_at:new Date().toISOString()
        }).eq('id',enrollment.id);
      }else{
        await admin.from('sales_sequence_enrollments').update({
          current_step:nextOrder,status:'completed',next_run_at:null,last_error:null,updated_at:new Date().toISOString()
        }).eq('id',enrollment.id);
        completed++;
      }
      succeeded++;
    }catch(e){
      failed++;
      await admin.from('sales_sequence_enrollments').update({
        last_error:e instanceof Error?e.message.slice(0,500):'sequence_step_failed',
        next_run_at:new Date(Date.now()+15*60000).toISOString(),updated_at:new Date().toISOString()
      }).eq('id',enrollment.id);
    }
  }
  return {processed:(enrollments??[]).length,succeeded,failed,completed};
}
