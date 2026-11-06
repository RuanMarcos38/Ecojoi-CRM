import {beforeEach,describe,it,expect,vi} from 'vitest';
import {GET,safeContactPicture} from '../app/api/contacts/[id]/avatar/route';
const m=vi.hoisted(()=>({contact:vi.fn(),picture:vi.fn(),eq:vi.fn()}));
vi.mock('../lib/auth/context',()=>({requirePermission:async()=>({tenantId:'tenant-a'})}));
vi.mock('../lib/server/evolution',()=>({getEvolutionContactPicture:m.picture}));
vi.mock('../lib/supabase/server',()=>({createClient:async()=>({from:()=>{const q={select:()=>q,eq:(...v:unknown[])=>{m.eq(...v);return q;},maybeSingle:m.contact};return q;}})}));
beforeEach(()=>{vi.clearAllMocks();});
const request=(id:string)=>GET(new Request('https://crm.example/api/contacts/'+id+'/avatar'),{params:Promise.resolve({id})});
describe('foto de contato isolada por empresa',()=>{
 it('rejeita destinos externos arbitrários e URLs sem HTTPS',()=>{
  expect(safeContactPicture('https://pps.whatsapp.net/photo.jpg')).toBeTruthy();
  for(const url of ['http://pps.whatsapp.net/a','https://whatsapp.net.evil.test/a','https://localhost/a','https://user:pass@pps.whatsapp.net/a'])expect(safeContactPicture(url)).toBeNull();
 });
 it('não busca foto para contato fora da empresa',async()=>{
  m.contact.mockResolvedValue({data:null,error:null});expect((await request('10000000-0000-4000-8000-000000000001')).status).toBe(404);
  expect(m.eq).toHaveBeenCalledWith('tenant_id','tenant-a');expect(m.picture).not.toHaveBeenCalled();
 });
 it('retorna imagem permitida sem expor credenciais e tolera ausência de foto',async()=>{
  m.contact.mockResolvedValue({data:{phone:'+5547999990000'},error:null});m.picture.mockResolvedValue('https://pps.whatsapp.net/photo.jpg');
  const r=await request('10000000-0000-4000-8000-000000000002');expect(r.status).toBe(307);expect(r.headers.get('location')).toBe('https://pps.whatsapp.net/photo.jpg');expect(r.headers.get('cache-control')).toBe('private, no-store');
  m.picture.mockRejectedValue(new Error('privacy'));expect((await request('10000000-0000-4000-8000-000000000003')).status).toBe(404);
 });
});
