import {beforeEach,describe,it,expect,vi} from 'vitest';
import {POST} from '../app/api/team/invite/route';
const m=vi.hoisted(()=>({list:vi.fn(),invite:vi.fn(),link:vi.fn(),profile:vi.fn(),insert:vi.fn(),audit:vi.fn()}));
vi.mock('../lib/auth/context',()=>({requirePermission:async()=>({tenantId:'tenant-a',userId:'admin'})}));
vi.mock('../lib/supabase/env',()=>({getPublicAppUrl:()=> 'https://crm.example'}));
vi.mock('../lib/server/access-email',()=>({sendAccessEmail:async()=>false}));
vi.mock('../lib/server/audit',()=>({audit:m.audit}));
vi.mock('../lib/supabase/admin',()=>({createAdminClient:()=>({auth:{admin:{listUsers:m.list,inviteUserByEmail:m.invite,generateLink:m.link}},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:m.profile,insert:m.insert};return q;}})}));
const request=(extra={})=>POST(new Request('https://crm.example/api/team/invite',{method:'POST',body:JSON.stringify({email:'new@example.com',full_name:'Novo Colaborador',role:'user',...extra})}));
beforeEach(()=>{vi.resetAllMocks();m.list.mockResolvedValue({data:{users:[]},error:null});m.profile.mockResolvedValue({data:null,error:null});m.insert.mockResolvedValue({error:null});m.invite.mockResolvedValue({data:{user:null},error:{code:'over_email_send_rate_limit',message:'email rate limit exceeded'}});m.link.mockResolvedValue({data:{user:{id:'new-user'},properties:{hashed_token:'single-use-token'}},error:null});});
describe('convites sem dependência da cota de e-mails',()=>{
 it('gera convite seguro quando o SMTP limita envio, sem informar e-mail enviado',async()=>{
  const r=await request();const d=await r.json();expect(r.status).toBe(201);expect(d.data.delivery).toBe('link');expect(d.data.invite_url).toContain('/acessar-convite?token_hash=');expect(r.headers.get('cache-control')).toBe('no-store');expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({tenant_id:'tenant-a',role:'user'}));expect(JSON.stringify(m.audit.mock.calls)).not.toContain('single-use-token');
 });
 it('não gera credencial nem envia convite para usuário de outra empresa',async()=>{
  m.list.mockResolvedValue({data:{users:[{id:'foreign',email:'new@example.com'}]}});m.profile.mockResolvedValue({data:{tenant_id:'tenant-b'},error:null});
  expect((await request()).status).toBe(409);expect(m.link).not.toHaveBeenCalled();expect(m.invite).not.toHaveBeenCalled();expect(m.insert).not.toHaveBeenCalled();
 });
 it('não altera o acesso de usuário já confirmado',async()=>{
  m.list.mockResolvedValue({data:{users:[{id:'member',email:'new@example.com',email_confirmed_at:'2026-01-01'}]}});m.profile.mockResolvedValue({data:{tenant_id:'tenant-a'},error:null});
  expect((await request()).status).toBe(409);expect(m.link).not.toHaveBeenCalled();
 });
 it('não limita a equipe aos primeiros mil usuários',async()=>{
  m.list.mockResolvedValueOnce({data:{users:Array.from({length:1000},(_,i)=>({id:String(i),email:`user${i}@example.com`}))}}).mockResolvedValueOnce({data:{users:[]}});
  expect((await request({delivery:'link'})).status).toBe(201);expect(m.list).toHaveBeenCalledWith({page:2,perPage:1000});
 });
});
