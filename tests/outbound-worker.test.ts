import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),send:vi.fn(),updates:[] as any[]}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.rpc,from:m.from})}));
vi.mock('@/lib/server/meta',()=>({sendWhatsAppText:m.send,sendWhatsAppTemplate:m.send,sendWhatsAppMedia:m.send,isWhatsAppWindowOpen:()=>true}));
import {processOutboundQueue} from '@/lib/server/outbound-queue';
beforeEach(()=>{
 vi.clearAllMocks();m.updates.length=0;
 m.rpc.mockImplementation(async(name:string)=>name==='crm_claim_outbound_messages'?{data:[{id:'q',tenant_id:'t',conversation_id:'c',message_id:'m',lease_token:'l',channel:'whatsapp',payload:{kind:'text',to:'+5547999371478',body:'Olá'},attempts:1,max_attempts:5}],error:null}:{data:true,error:null});
 m.from.mockImplementation(()=>{const chain:any={select:()=>chain,eq:()=>chain,update:(row:any)=>{m.updates.push(row);return chain;},maybeSingle:async()=>({data:{id:'q',attendance_state:'in_service',status:'open'},error:null})};return chain;});
});
describe('confirmação de envio',()=>{
 it('confirma fila, mensagem e conversa por única RPC após aceite',async()=>{
  m.send.mockResolvedValue({delivered:true,providerMessageId:'wamid.ok'});expect(await processOutboundQueue()).toMatchObject({sent:1});
  expect(m.rpc).toHaveBeenCalledWith('crm_complete_outbound_message',{p_tenant_id:'t',p_job_id:'q',p_lease_token:'l',p_provider_message_id:'wamid.ok'});
 });
 it('aceite com falha de banco exige conciliação e não reenvia automaticamente',async()=>{
  m.send.mockResolvedValue({delivered:true,providerMessageId:'wamid.ok'});
  const claim=m.rpc.getMockImplementation()!;m.rpc.mockImplementation(async(name:string,args:any)=>name==='crm_complete_outbound_message'?{data:null,error:{message:'DB unavailable'}}:claim(name,args));
  expect(await processOutboundQueue()).toMatchObject({dead:1});expect(m.updates[0]).toMatchObject({status:'dead_letter',last_error:'provider_accepted_reconciliation_required'});
 });
 it('rejeição confirmada pelo provedor admite retry',async()=>{
  m.send.mockResolvedValue({delivered:false,reason:'meta_provider_rejected'});expect(await processOutboundQueue()).toMatchObject({failed:1});expect(m.updates[0].status).toBe('failed');
 });
 it('resultado de rede incerto exige conciliação em vez de duplicar envio',async()=>{
  m.send.mockResolvedValue({delivered:false,reason:'integration_timeout'});expect(await processOutboundQueue()).toMatchObject({dead:1});expect(m.updates[0].status).toBe('dead_letter');
 });
 it('takeover humano impede envio IA ainda na fila',async()=>{
  const claim=m.rpc.getMockImplementation()!;m.rpc.mockImplementation(async(name:string,args:any)=>{const r=await claim(name,args);if(name==='crm_claim_outbound_messages')r.data[0].payload.actor='ai';return r;});
  expect(await processOutboundQueue()).toMatchObject({dead:1});expect(m.send).not.toHaveBeenCalled();expect(m.updates[0].last_error).toBe('ai_human_takeover');
 });
});

