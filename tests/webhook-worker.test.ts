import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),post:vi.fn(),updates:[] as Array<{table:string;patch:any}>}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:mocks.rpc,from:mocks.from})}));
vi.mock('@/lib/server/webhook-transport',()=>({postWebhook:mocks.post}));
import {processWebhookDeliveries} from '@/lib/server/webhook-worker';
beforeEach(()=>{
 vi.clearAllMocks();mocks.updates.length=0;
 mocks.rpc.mockResolvedValue({data:[{id:'d1',tenant_id:'t1',subscription_id:'s1',lease_token:'l1',event_type:'lead.created',entity_id:'c1',payload:{id:'c1'},created_at:'2026-10-03',attempts:1,max_attempts:5}],error:null});
 mocks.from.mockImplementation((table:string)=>{
  const chain:any={select:()=>chain,eq:()=>chain,update:(patch:any)=>{mocks.updates.push({table,patch});return chain;},
   maybeSingle:async()=>({data:table==='webhook_secrets'?{signing_key:'test-only'}:table==='webhook_deliveries'?{id:'d1'}:{active:true,endpoint_url:'https://example.com'},error:null}),
   then:(resolve:any)=>resolve({error:null})};return chain;
 });
});
describe('worker webhook',()=>{
 it('processa reserva e conclui HTTP 204',async()=>{
  mocks.post.mockResolvedValue({status:204,ok:true});expect(await processWebhookDeliveries(25,'t1')).toMatchObject({sent:1});
  expect(mocks.rpc).toHaveBeenCalledWith('crm_claim_webhook_deliveries',{p_limit:25,p_tenant_id:'t1'});
  expect(mocks.updates[0].patch).toMatchObject({status:'sent',response_status:204,locked_at:null});
 });
 it('agenda retry para HTTP 503',async()=>{mocks.post.mockResolvedValue({status:503,ok:false});expect(await processWebhookDeliveries()).toMatchObject({failed:1});expect(mocks.updates[0].patch).toMatchObject({status:'failed',error:'HTTP 503'});});
 it('aplica DLQ e sanitiza erro',async()=>{
  const row=(await mocks.rpc()).data[0];mocks.rpc.mockResolvedValue({data:[{...row,attempts:5}],error:null});mocks.post.mockRejectedValue(new Error('token=secret'));
  expect(await processWebhookDeliveries()).toMatchObject({dead:1});expect(mocks.updates[0].patch).toMatchObject({status:'dead_letter',error:'integration_request_failed'});
 });
 it('não processa fila reservada por outro worker',async()=>{mocks.rpc.mockResolvedValue({data:[],error:null});expect(await processWebhookDeliveries()).toMatchObject({processed:0});expect(mocks.post).not.toHaveBeenCalled();});
});

