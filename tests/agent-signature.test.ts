import {beforeEach,describe,it,expect,vi} from 'vitest';
import {POST} from '../app/api/conversations/[id]/messages/route';
import {signAgentMessage} from '../lib/server/agent-signature';
const m=vi.hoisted(()=>({send:vi.fn(),queue:vi.fn(),insert:vi.fn(),name:vi.fn(),eq:vi.fn()}));
vi.mock('../lib/auth/context',()=>({requirePermission:async()=>({tenantId:'tenant-a',userId:'actual-sender'})}));
vi.mock('../lib/server/feature',()=>({requireFeature:async()=>{}}));
vi.mock('../lib/server/audit',()=>({audit:async()=>{}}));
vi.mock('../lib/server/whatsapp',()=>({canSendFreeformWhatsApp:async()=>true,sendWhatsAppText:m.send}));
vi.mock('../lib/server/outbound-queue',()=>({enqueueOutbound:m.queue}));
vi.mock('../lib/supabase/server',()=>({createClient:async()=>({from:(table:string)=>{const q={select:()=>q,eq:(...args:unknown[])=>{m.eq(...args);return q;},insert:(v:unknown)=>{m.insert(v);return q;},update:()=>q,single:async()=>table==='profiles'?{data:{full_name:m.name()}}:{data:{id:'msg'}},maybeSingle:async()=>({data:{channel:'whatsapp',attendance_state:'in_service',contact:{phone:'+5547999371478'}}})};return q;}})}));
beforeEach(()=>{vi.clearAllMocks();m.name.mockReturnValue('Gelson');m.send.mockResolvedValue({delivered:true});});
const send=()=>POST(new Request('https://crm.example/api/conversations/x/messages',{method:'POST',body:JSON.stringify({body:'Olá, tudo bem?'})}),{params:Promise.resolve({id:'conversation'})});
describe('nome visível ao cliente WhatsApp',()=>{
 it('assina pelo usuário autenticado e registra o mesmo texto enviado',async()=>{
  expect((await send()).status).toBe(201);expect(m.eq).toHaveBeenCalledWith('id','actual-sender');expect(m.send).toHaveBeenCalledWith('tenant-a','+5547999371478','*Gelson*\nOlá, tudo bem?');expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({body:'*Gelson*\nOlá, tudo bem?',sender_user_id:'actual-sender'}));
 });
 it('mantém o autor original ao reenviar pela fila',async()=>{
  m.name.mockReturnValue('Ruan');m.send.mockResolvedValue({delivered:false,reason:'offline'});await send();expect(m.queue).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({body:'*Ruan*\nOlá, tudo bem?'})}));
 });
 it('evita formatação e quebra de linha no nome',()=>{expect(signAgentMessage('*Ruan*\nAdmin','Olá')).toBe('*Ruan Admin*\nOlá');});
});
