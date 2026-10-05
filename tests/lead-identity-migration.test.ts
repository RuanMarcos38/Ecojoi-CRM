import{readFile}from'node:fs/promises';import{PGlite}from'@electric-sql/pglite';import{beforeAll,afterAll,describe,it,expect}from'vitest';
let db:PGlite;const tenant='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',owner='00000000-0000-4000-8000-000000000003';
beforeAll(async()=>{
 db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create type contact_status as enum('lead','customer');create type conversation_status as enum('open','pending','closed');
 create table contacts(id uuid primary key default gen_random_uuid(),tenant_id uuid,name text,email text,phone text,source text,status contact_status,attribution jsonb,owner_id uuid,lead_score integer,lead_temperature text,updated_at timestamptz default now());
 create table contact_channels(id uuid default gen_random_uuid(),tenant_id uuid,contact_id uuid,channel text,external_id text,display_name text,metadata jsonb,updated_at timestamptz default now(),unique(tenant_id,channel,external_id));
 create table conversations(id uuid primary key default gen_random_uuid(),tenant_id uuid,contact_id uuid,channel text,status conversation_status default 'open',assigned_to uuid,attendance_state text default 'waiting',attendance_changed_at timestamptz,updated_at timestamptz default now());
 create function public.next_lead_assignee(uuid) returns uuid language sql as $$select null::uuid$$;
 `);
 await db.exec(await readFile(new URL('../database/migrations/026_phone_identity_lookup.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../database/migrations/032_lead_identity_transactions.sql',import.meta.url),'utf8'));
},60000);
afterAll(async()=>{await db?.close();});
async function resolve(t=tenant,external='wa-1',name:string|null='Cliente Ecojoi',phone:string|null='+5547999371478'){
 return (await db.query<{result:any}>('select crm_resolve_lead_identity($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result',[t,'whatsapp',external,name,'Nome genérico',null,phone,'WhatsApp',{},45])).rows[0].result;
}
describe('identidade de leads sem duplicar entidades',()=>{
 it('repetição da mesma identidade reutiliza contato e vínculo',async()=>{
  const first=await resolve(),second=await resolve();
  expect(first.is_new).toBe(true);expect(second.is_new).toBe(false);expect(second.contact_id).toBe(first.contact_id);
  expect((await db.query('select id from contacts')).rows).toHaveLength(1);expect((await db.query('select id from contact_channels')).rows).toHaveLength(1);
 });
 it('mesmo número em outro canal associa ao contato existente',async()=>{
  const original=await resolve(),next=await resolve(tenant,'wa-2');
  expect(next.contact_id).toBe(original.contact_id);expect((await db.query('select id from contacts')).rows).toHaveLength(1);
 });
 it('número compartilhado sem vínculo específico exige revisão',async()=>{
  await db.query("insert into contacts(tenant_id,name,phone,status) values($1,'Compartilhado','(47) 99937-1478','lead')",[tenant]);
  await expect(resolve(tenant,'new-ambiguous')).rejects.toThrow('lead_identity_manual_review');
  expect((await db.query('select id from contact_channels where external_id=$1',['new-ambiguous'])).rows).toHaveLength(0);
 });
 it('vínculo específico continua determinístico apesar de telefone compartilhado',async()=>{
  expect((await resolve()).is_new).toBe(false);await resolve(tenant,'wa-1',null);
  expect((await db.query<{name:string}>("select name from contacts where id=(select contact_id from contact_channels where external_id='wa-1')")).rows[0].name).toBe('Cliente Ecojoi');
 });
 it('isola a mesma identidade por empresa',async()=>{
  expect((await resolve(other)).is_new).toBe(true);expect((await db.query('select id from contact_channels where tenant_id=$1',[other])).rows).toHaveLength(1);
 });
 it('reutiliza conversa aberta sem retirar responsabilidade da IA',async()=>{
  const contact=(await resolve()).contact_id;
  const create=async()=>(await db.query<{id:string}>('select crm_get_or_create_inbound_conversation($1,$2,$3,$4) as id',[tenant,contact,'whatsapp',null])).rows[0].id;
  const first=await create();expect(await create()).toBe(first);
  await db.query("update conversations set attendance_state='automatic' where id=$1",[first]);
  expect((await db.query<{id:string}>('select crm_get_or_create_inbound_conversation($1,$2,$3,$4) as id',[tenant,contact,'whatsapp',owner])).rows[0].id).toBe(first);
  expect((await db.query<{attendance_state:string;assigned_to:string|null}>('select attendance_state,assigned_to from conversations where id=$1',[first])).rows[0]).toEqual({attendance_state:'automatic',assigned_to:null});
 });
 it('não cria conversa para contato de outra empresa',async()=>{
  const contact=(await resolve()).contact_id;
  await expect(db.query('select crm_get_or_create_inbound_conversation($1,$2,$3,$4)',[other,contact,'whatsapp',null])).rejects.toThrow('contact_not_found');
 });
 it('navegador não executa o resolvedor privilegiado',async()=>{
  expect((await db.query<{allowed:boolean}>("select has_function_privilege('authenticated','public.crm_resolve_lead_identity(uuid,text,text,text,text,text,text,text,jsonb,integer)','execute') as allowed")).rows[0].allowed).toBe(false);
 });
});

