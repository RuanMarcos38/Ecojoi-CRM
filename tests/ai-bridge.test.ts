import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),record:vi.fn(),post:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:m.from,rpc:m.rpc})}));
vi.mock('@/lib/server/n8n',()=>({recordN8nExecution:m.record}));
vi.mock('@/lib/server/webhook-transport',()=>({postWebhook:m.post}));
import {notifyAiAgent} from '@/lib/server/ai-agent';
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('AI_AGENT_WEBHOOK_URL','');vi.stubEnv('AI_AGENT_WEBHOOK_TOKEN','bridge-test-only');m.rpc.mockResolvedValue({data:{delivery:'waiting'},error:null});
 m.from.mockImplementation(()=>{const chain:any={select:()=>chain,eq:()=>chain,gt:()=>chain,maybeSingle:async()=>({data:{ai_agent_config:{}},error:null}),order:()=>chain,limit:async()=>({data:[],error:null})};return chain;});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('fallback da ponte IA',()=>{
 it('sem configuração retorna conversa automática para equipe por RPC atômica',async()=>{
  const result=await notifyAiAgent({tenantId:'t',conversationId:'c',state:'automatic'});
  expect(result.delivered).toBe(false);expect(m.rpc).toHaveBeenCalledWith('crm_register_ai_decision',expect.objectContaining({p_tenant_id:'t',p_action:'escalate',p_reason:'ai_bridge_unavailable'}));
 });
 it('liberação humana não dispara handoff repetido',async()=>{
  await notifyAiAgent({tenantId:'t',conversationId:'c',state:'waiting'});expect(m.rpc).not.toHaveBeenCalled();
 });
 it('ponte HTTP falha envia para equipe',async()=>{
  vi.stubEnv('AI_AGENT_WEBHOOK_URL','https://example.com/hook');m.post.mockResolvedValue({ok:false,status:503});
  await notifyAiAgent({tenantId:'t',conversationId:'c',state:'automatic'});expect(m.rpc).toHaveBeenCalled();
 });
 it('sucesso mantém modo automático sem criar handoff',async()=>{
  vi.stubEnv('AI_AGENT_WEBHOOK_URL','https://example.com/hook');m.post.mockResolvedValue({ok:true,status:204});
  await notifyAiAgent({tenantId:'t',conversationId:'c',state:'automatic'});expect(m.rpc).not.toHaveBeenCalled();
 });
});

