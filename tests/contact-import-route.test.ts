import {beforeEach,describe,it,expect,vi} from 'vitest';
import {POST} from '../app/api/contacts/import/route';
const m=vi.hoisted(()=>({ingest:vi.fn(),permission:vi.fn()}));
vi.mock('../lib/auth/context',()=>({requirePermission:m.permission}));
vi.mock('../lib/server/lead-ingestion',()=>({ingestLead:m.ingest}));
beforeEach(()=>{vi.clearAllMocks();m.permission.mockResolvedValue({tenantId:'tenant-a'});m.ingest.mockResolvedValue({});});
function request(csv:string,options:Record<string,string>={}){
 const form=new FormData();form.append('file',new File([csv],'suri.csv',{type:'text/csv'}));for(const [k,v] of Object.entries(options))form.append(k,v);
 return POST(new Request('https://crm.example/api/contacts/import',{method:'POST',body:form}));
}
describe('importação por lotes sem corte silencioso',()=>{
 it('prévia não grava contatos',async()=>{const r=await request('Nome,Telefone\nCliente,47999991111',{preview:'true'});expect(r.status).toBe(200);expect(m.ingest).not.toHaveBeenCalled();});
 it('processa após a linha 3000 e preserva cadastros existentes',async()=>{
  const csv='Nome,Telefone\n'+Array.from({length:3002},(_,i)=>`Cliente ${i},47999991111`).join('\n');
  const r=await request(csv,{offset:'3000',source:'Suri',create_conversation:'true'});
  expect(await r.json()).toMatchObject({data:{total:3002,processed:2,done:true,nextOffset:3002}});
  expect(m.ingest).toHaveBeenCalledWith(expect.objectContaining({tenantId:'tenant-a',phone:'+5547999991111',channel:'whatsapp',preserveExisting:true,createConversation:true}));
  expect(m.permission).toHaveBeenCalledWith('conversations.create');
 });
 it('relata linha inválida sem criar contato vazio',async()=>{
  const r=await request('Nome,Telefone\nCliente,123');expect(await r.json()).toMatchObject({data:{failed:1,processed:0,errors:[{row:2,error:'Telefone inválido'}]}});expect(m.ingest).not.toHaveBeenCalled();
 });
});
