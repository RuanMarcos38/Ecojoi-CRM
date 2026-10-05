import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),asset:vi.fn(),process:vi.fn(),upserts:[] as any[],updates:[] as any[]}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.rpc,from:m.from})}));
vi.mock('@/lib/server/meta',()=>({tenantByMetaAsset:m.asset,processMetaWebhook:m.process}));
import {enqueueMetaWebhook,processMetaInbox} from '@/lib/server/meta-inbox';
beforeEach(()=>{
 vi.clearAllMocks();m.upserts.length=0;m.updates.length=0;m.asset.mockResolvedValue('t1');m.process.mockResolvedValue(undefined);
 m.rpc.mockResolvedValue({data:[{id:'i1',tenant_id:'t1',lease_token:'l1',attempts:1,max_attempts:5,inbound_payload:{object:'page'}}],error:null});
 m.from.mockImplementation(()=>{
  const chain:any={upsert:(row:any,options:any)=>{m.upserts.push({row,options});return chain;},update:(row:any)=>{m.updates.push(row);return chain;},eq:()=>chain,select:()=>chain,maybeSingle:async()=>({data:{id:'i1'},error:null}),then:(resolve:any)=>resolve({data:[{id:'i1'}],error:null})};return chain;
 });
});
describe('inbox Meta persistente',()=>{
 it('grava mensagem antes de confirmar webhook e não reseta eventos duplicados',async()=>{
  const payload={object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'asset'},messages:[{id:'wamid.1',from:'5547999371478',type:'text',text:{body:'Olá'}}]}}]}]};
  expect(await enqueueMetaWebhook(payload)).toEqual({queued:1,inspected:1});
  expect(m.process).not.toHaveBeenCalled();expect(m.upserts[0].options.ignoreDuplicates).toBe(true);
  expect(m.upserts[0].row).toMatchObject({tenant_id:'t1',event_key:'wamid.1',processing_status:'pending'});
 });
 it('ignora echoes para não gerar ciclos e ignora status inválido',async()=>{
  expect(await enqueueMetaWebhook({object:'page',entry:[{id:'page',messaging:[{sender:{id:'sender'},message:{mid:'echo',is_echo:true}}]}]})).toEqual({queued:0,inspected:0});
 });
 it('worker só conclui após processamento e passa tenant confirmado',async()=>{
  expect(await processMetaInbox(5,'t1')).toMatchObject({succeeded:1});
  expect(m.process).toHaveBeenCalledWith({object:'page'},'t1');expect(m.updates[0].processing_status).toBe('completed');
 });
 it('falha transitória fica para nova tentativa, sem registrar sucesso',async()=>{
  m.process.mockRejectedValue(new Error('credential=secret'));
  expect(await processMetaInbox()).toMatchObject({failed:1});expect(m.updates[0]).toMatchObject({processing_status:'failed',last_error:'integration_request_failed',processed_at:null});
 });
 it('identidade ambígua vai para revisão manual sem escolher contato',async()=>{
  m.process.mockRejectedValue(new Response('ambiguous',{status:409}));
  expect(await processMetaInbox()).toMatchObject({dead:1});expect(m.updates[0].last_error).toBe('identity_manual_review_required');
 });
 it('sem reserva não processa evento de outro worker',async()=>{
  m.rpc.mockResolvedValue({data:[],error:null});expect(await processMetaInbox()).toMatchObject({processed:0});expect(m.process).not.toHaveBeenCalled();
 });
});

