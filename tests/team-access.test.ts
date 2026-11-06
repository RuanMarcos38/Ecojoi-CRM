import {beforeEach,describe,it,expect,vi} from 'vitest';
import {PATCH,DELETE} from '../app/api/team/[id]/route';
import {POST as accessLink} from '../app/api/team/[id]/access-link/route';
const m=vi.hoisted(()=>({context:vi.fn(),permission:vi.fn(),rpc:vi.fn(),profile:vi.fn(),user:vi.fn(),link:vi.fn(),email:vi.fn()}));
vi.mock('../lib/auth/context',()=>({getRequestContext:m.context,requirePermission:m.permission}));
vi.mock('../lib/server/audit',()=>({audit:async()=>{}}));
vi.mock('../lib/supabase/env',()=>({getPublicAppUrl:()=> 'https://crm.example'}));
vi.mock('../lib/server/access-email',()=>({sendAccessEmail:m.email}));
vi.mock('../lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.rpc,auth:{admin:{getUserById:m.user,generateLink:m.link}},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:m.profile};return q;}})}));
const id='10000000-0000-4000-8000-000000000001';const params={params:Promise.resolve({id})};
const req=(body:unknown)=>new Request('https://crm.example/api/team/'+id,{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();m.context.mockResolvedValue({tenantId:'tenant',userId:'actor',role:'company_admin'});m.permission.mockResolvedValue({tenantId:'tenant',userId:'actor',role:'company_admin'});m.rpc.mockResolvedValue({data:{data:{active:false}},error:null});m.profile.mockResolvedValue({data:{id,full_name:'Estéfani',active:true,role:'user',deleted_at:null}});m.user.mockResolvedValue({data:{user:{id,email:'adm@ecojoi.com.br',email_confirmed_at:'2026-11-06'}}});m.link.mockResolvedValue({data:{user:{id},properties:{hashed_token:'private-token'}}});m.email.mockResolvedValue(true);});
describe('permissões de gestão de acessos',()=>{
 it('gestor pode apenas inativar',async()=>{m.context.mockResolvedValue({tenantId:'tenant',userId:'actor',role:'manager'});expect((await PATCH(req({active:false}),params)).status).toBe(200);for(const body of [{active:true},{role:'company_admin'},{restore:true},{active:false,role:'user'}])expect((await PATCH(req(body),params)).status).toBe(403);expect((await DELETE(req({}),params)).status).toBe(403);expect(m.rpc).toHaveBeenCalledTimes(1);});
 it('usuário comum não altera outros acessos',async()=>{m.context.mockResolvedValue({role:'user'});expect((await PATCH(req({active:false}),params)).status).toBe(403);expect(m.rpc).not.toHaveBeenCalled();});
 it('master exclui acesso sem apagar a identidade ou as mensagens',async()=>{expect((await DELETE(req({}),params)).status).toBe(200);expect(m.rpc).toHaveBeenCalledWith('manage_team_member_access',expect.objectContaining({p_delete:true,p_actor:'actor',p_target:id}));});
 it('preserva a proteção de acesso próprio retornada pelo banco',async()=>{m.rpc.mockResolvedValue({data:{error:'cannot_change_self_access'}});expect((await PATCH(req({active:false}),params)).status).toBe(409);});
});
describe('link de acesso para quem já confirmou o convite',()=>{
 it('gera recuperação, envia pelo e-mail local e não expõe o token na resposta',async()=>{const r=await accessLink(req({delivery:'email'}),params);expect(r.status).toBe(200);expect(m.link).toHaveBeenCalledWith(expect.objectContaining({type:'recovery',email:'adm@ecojoi.com.br'}));expect(m.email).toHaveBeenCalledWith('adm@ecojoi.com.br','Estéfani',expect.stringContaining('/acessar-convite?token_hash='));expect(await r.json()).toMatchObject({data:{delivery:'email',invite_url:null}});});
 it('inativo ou excluído não recebe recuperação',async()=>{m.profile.mockResolvedValue({data:{id,active:false}});expect((await accessLink(req({delivery:'email'}),params)).status).toBe(409);expect(m.link).not.toHaveBeenCalled();expect(m.email).not.toHaveBeenCalled();});
 it('não anuncia envio se o servidor de e-mail falhar',async()=>{m.email.mockResolvedValue(false);const r=await accessLink(req({delivery:'email'}),params);expect(await r.json()).toMatchObject({data:{delivery:'link',invite_url:expect.stringContaining('/acessar-convite?')}});});
});
