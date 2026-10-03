import{beforeEach,describe,it,expect,vi}from'vitest';
const m=vi.hoisted(()=>({from:vi.fn(),enqueue:vi.fn(),conversation:{} as any,writes:[] as any[]}));
vi.mock('@/lib/auth/context',()=>({requirePermission:async()=>({tenantId:'tenant',userId:'user',role:'company_admin'})}));
vi.mock('@/lib/server/feature',()=>({requireFeature:async()=>undefined}));
vi.mock('@/lib/server/audit',()=>({audit:async()=>undefined}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:m.from,storage:{from:()=>({upload:async()=>({error:null}),remove:async()=>({error:null})})}})}));
vi.mock('@/lib/server/meta',()=>({isWhatsAppWindowOpen:()=>true}));
vi.mock('@/lib/server/outbound-queue',()=>({enqueueOutbound:m.enqueue}));
import{POST as text}from'@/app/api/conversations/[id]/messages/route';
import{POST as template}from'@/app/api/conversations/[id]/template/route';
import{POST as attachment}from'@/app/api/conversations/[id]/attachments/route';
const params={params:Promise.resolve({id:'conversation'})};
beforeEach(()=>{
 vi.clearAllMocks();m.writes.length=0;m.enqueue.mockResolvedValue('queue');
 m.conversation={id:'conversation',status:'open',channel:'whatsapp',assigned_to:'user',attendance_state:'in_service',last_inbound_at:new Date().toISOString(),first_response_at:null,contact:{phone:'+5547999371478',consent_status:'opt_in'}};
 m.from.mockImplementation((table:string)=>{
  const chain:any={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:m.conversation,error:null}),
   insert:(row:any)=>{m.writes.push({table,row});return chain;},update:(row:any)=>{m.writes.push({table,row});return chain;},
   single:async()=>({data:{id:'message',status:'queued'},error:null}),then:(resolve:any)=>resolve({error:null})};return chain;
 });
});
describe('envio humano persistido antes do provedor',()=>{
 it('texto entra na fila com identidade do responsável, sem chamado externo direto',async()=>{
  const r=await text(new Request('http://localhost/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body:'Olá'})}),params);
  expect(r.status).toBe(201);expect((await r.json()).delivery).toBe('queued');
  expect(m.enqueue).toHaveBeenCalledWith(expect.objectContaining({messageId:'message',payload:expect.objectContaining({kind:'text',actor:'human',actorUserId:'user'})}));
  expect(m.writes.find(w=>w.table==='conversations')?.row.first_response_at).toBeUndefined();
 });
 it('template é enfileirado e preserva estado de resposta até confirmação',async()=>{
  const r=await template(new Request('http://localhost/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'hello_world'})}),params);
  expect(r.status).toBe(201);expect(m.enqueue).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({kind:'template',actorUserId:'user'})}));
 });
 it('anexo persistido usa caminho privado na fila',async()=>{
  const form=new FormData();form.append('file',new File(['conteúdo fictício'],'teste.txt',{type:'text/plain'}));
  const r=await attachment(new Request('http://localhost/api',{method:'POST',body:form}),params);
  expect(r.status).toBe(201);expect(m.enqueue).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({kind:'media',actor:'human'})}));
 });
 it('outro atendente não cria mensagem nem fila',async()=>{
  m.conversation.assigned_to='other';const r=await text(new Request('http://localhost/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body:'Olá'})}),params);
  expect(r.status).toBe(409);expect(m.enqueue).not.toHaveBeenCalled();expect(m.writes).toHaveLength(0);
 });
});

