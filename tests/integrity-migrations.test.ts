import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
let db:PGlite;
const tenant='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',contact='00000000-0000-4000-8000-000000000003',conversation='00000000-0000-4000-8000-000000000004';
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create table contacts(id uuid primary key,tenant_id uuid,phone text);
 create table conversations(id uuid primary key,tenant_id uuid,contact_id uuid,channel text,status text default 'open',attendance_state text default 'automatic',assigned_to uuid,
  created_at timestamptz default now(),updated_at timestamptz default now(),attendance_changed_at timestamptz,last_inbound_at timestamptz default now(),
  last_outbound_at timestamptz,first_response_at timestamptz,ai_summary text,ai_next_action text,ai_summary_updated_at timestamptz);
 create table messages(id uuid primary key default gen_random_uuid(),tenant_id uuid,conversation_id uuid,direction text,body text,status text,message_type text,provider_message_id text,created_at timestamptz default now());
 create table outbound_message_queue(id uuid primary key default gen_random_uuid(),tenant_id uuid,conversation_id uuid,message_id uuid,channel text,payload jsonb,status text default 'pending',
  attempts integer default 0,max_attempts integer default 5,next_attempt_at timestamptz default now(),locked_at timestamptz,last_error text,completed_at timestamptz,updated_at timestamptz default now());
 create table webhook_deliveries(id uuid primary key default gen_random_uuid(),tenant_id uuid,subscription_id uuid,event_type text,entity_id text,payload jsonb default '{}',
  status text default 'pending' check(status in ('pending','sent','failed')),attempts integer default 0,max_attempts integer default 5,next_attempt_at timestamptz default now(),created_at timestamptz default now(),error text);
 create table integration_events(id bigint generated always as identity primary key,tenant_id uuid,provider text,event_key text,event_type text,payload_meta jsonb,unique(tenant_id,provider,event_key));
 create table tenant_settings(tenant_id uuid primary key,ai_agent_config jsonb default '{}');
 create table ai_knowledge_documents(id uuid primary key,tenant_id uuid,name text,extracted_text text,active boolean default true,updated_at timestamptz default now());
 create table ai_usage_logs(id uuid default gen_random_uuid(),tenant_id uuid,conversation_id uuid,provider text,model text,input_tokens integer,output_tokens integer,estimated_cost numeric,metadata jsonb);
 create table notifications(id uuid default gen_random_uuid(),tenant_id uuid,type text,title text,body text,entity_type text,entity_id text,priority text);
 create table audit_logs(id bigint generated always as identity,tenant_id uuid,user_id uuid,action text,entity text,entity_id text,metadata jsonb);
 `);
 const base=new URL('../database/migrations/',import.meta.url);
 await db.exec(await readFile(new URL('024_webhook_queue_concurrency.sql',base),'utf8'));
 await db.exec(await readFile(new URL('025_ai_reply_integrity.sql',base),'utf8'));
 await db.exec(await readFile(new URL('026_phone_identity_lookup.sql',base),'utf8'));
 await db.exec(await readFile(new URL('027_meta_inbox.sql',base),'utf8'));
 await db.exec(await readFile(new URL('028_outbound_acknowledgement.sql',base),'utf8'));
 await db.exec(await readFile(new URL('029_knowledge_publication.sql',base),'utf8'));
 await db.exec(await readFile(new URL('030_ai_kill_switch.sql',base),'utf8'));
 await db.query('insert into contacts values($1,$2,$3)',[contact,tenant,'+5547999371478']);
 await db.query('insert into conversations(id,tenant_id,contact_id,channel) values($1,$2,$3,$4)',[conversation,tenant,contact,'whatsapp']);
},60000);
afterAll(async()=>{await db?.close();});
describe('migrações de integridade em PostgreSQL local',()=>{
 it('encontra telefone legado e informa múltiplos vínculos sem escolher um',async()=>{
  await db.query("update contacts set phone='(47) 99937-1478' where id=$1",[contact]);
  expect((await db.query('select * from crm_find_phone_contacts($1,$2)',[tenant,'+5547999371478'])).rows).toHaveLength(1);
  expect((await db.query('select * from crm_find_phone_contacts($1,$2)',[other,'+5547999371478'])).rows).toHaveLength(0);
  const shared='00000000-0000-4000-8000-000000000006';
  await db.query('insert into contacts values($1,$2,$3)',[shared,tenant,'47999371478']);
  expect((await db.query('select * from crm_find_phone_contacts($1,$2)',[tenant,'+5547999371478'])).rows).toHaveLength(2);
  await db.query('delete from contacts where id=$1',[shared]);
 });
 it('é reaplicável sem perder dados',async()=>{
  for(const file of ['024_webhook_queue_concurrency.sql','025_ai_reply_integrity.sql','026_phone_identity_lookup.sql','027_meta_inbox.sql','028_outbound_acknowledgement.sql','029_knowledge_publication.sql','030_ai_kill_switch.sql'])await db.exec(await readFile(new URL('../database/migrations/'+file,import.meta.url),'utf8'));
  expect((await db.query('select id from contacts')).rows).toHaveLength(1);
 });
 it('restringe RPCs ao serviço e isola filas por tenant',async()=>{
  const permissions=await db.query<{allowed:boolean}>(`select has_function_privilege('anon','public.crm_claim_webhook_deliveries(integer,uuid)','execute') as allowed`);
  expect(permissions.rows[0].allowed).toBe(false);
  await db.query('insert into webhook_deliveries(tenant_id,event_type) values($1,$3),($2,$3)',[tenant,other,'lead.created']);
  const first=await db.query<{tenant_id:string;lease_token:string;attempts:number}>('select * from crm_claim_webhook_deliveries(25,$1)',[tenant]);
  expect(first.rows).toHaveLength(1);expect(first.rows[0]).toMatchObject({tenant_id:tenant,attempts:1});expect(first.rows[0].lease_token).toBeTruthy();
  expect((await db.query('select * from crm_claim_webhook_deliveries(25,$1)',[tenant])).rows).toHaveLength(0);
 });
 it('recupera reserva abandonada e muda token',async()=>{
  const previous=await db.query<{lease_token:string}>("select lease_token from webhook_deliveries where tenant_id=$1",[tenant]);
  await db.query("update webhook_deliveries set locked_at=now()-interval '6 minutes' where tenant_id=$1",[tenant]);
  const next=await db.query<{lease_token:string;attempts:number}>('select * from crm_claim_webhook_deliveries(25,$1)',[tenant]);
  expect(next.rows[0].attempts).toBe(2);expect(next.rows[0].lease_token).not.toBe(previous.rows[0].lease_token);
 });
 it('não prende para sempre uma reserva que esgotou tentativas',async()=>{
  await db.query("update webhook_deliveries set attempts=5,locked_at=now()-interval '6 minutes' where tenant_id=$1",[tenant]);
  expect((await db.query('select * from crm_claim_webhook_deliveries(25,$1)',[tenant])).rows).toHaveLength(0);
  expect((await db.query<{status:string}>('select status from webhook_deliveries where tenant_id=$1',[tenant])).rows[0].status).toBe('dead_letter');
 });
 it('registra IA e fila atomicamente e ignora evento repetido',async()=>{
  const args=[tenant,conversation,'event-1','respond','Olá'];
  const first=await db.query<{result:any}>('select crm_register_ai_decision($1,$2,$3,$4,$5) as result',args);
  expect(first.rows[0].result.delivery).toBe('queued');
  const duplicate=await db.query<{result:any}>('select crm_register_ai_decision($1,$2,$3,$4,$5) as result',args);
  expect(duplicate.rows[0].result.duplicate).toBe(true);
  expect((await db.query('select * from messages')).rows).toHaveLength(1);
  expect((await db.query('select * from outbound_message_queue')).rows).toHaveLength(1);
  expect((await db.query('select * from ai_usage_logs')).rows).toHaveLength(1);
 });
 it('cancela fila IA no takeover e impede nova resposta',async()=>{
  await db.query("update conversations set attendance_state='in_service' where id=$1",[conversation]);
  expect((await db.query<{status:string}>('select status from outbound_message_queue')).rows[0].status).toBe('dead_letter');
  expect((await db.query<{status:string}>('select status from messages')).rows[0].status).toBe('failed');
  await expect(db.query('select crm_register_ai_decision($1,$2,$3,$4,$5)',[tenant,conversation,'event-2','respond','Olá novamente'])).rejects.toThrow('ai_conversation_not_automatic');
 });
 it('handoff cria fila humana, notificação e auditoria',async()=>{
  await db.query("update conversations set attendance_state='automatic' where id=$1",[conversation]);
  const result=await db.query<{result:any}>('select crm_register_ai_decision($1,$2,$3,$4,$5,$6) as result',[tenant,conversation,'handoff-1','escalate',null,'confidence_below_threshold']);
  expect(result.rows[0].result.delivery).toBe('waiting');
  expect((await db.query<{attendance_state:string}>('select attendance_state from conversations where id=$1',[conversation])).rows[0].attendance_state).toBe('waiting');
  expect((await db.query('select * from notifications')).rows).toHaveLength(1);
  expect((await db.query("select * from audit_logs where action='ai.escalated'")).rows).toHaveLength(1);
 });
 it('RPC IA não é executável pelo navegador',async()=>{
  const permission=await db.query<{allowed:boolean}>(`select has_function_privilege('authenticated','public.crm_register_ai_decision(uuid,uuid,text,text,text,text,text,text,jsonb)','execute') as allowed`);
  expect(permission.rows[0].allowed).toBe(false);
 });
 it('inbox preserva eventos antigos e reserva somente eventos novos do tenant',async()=>{
  await db.query("insert into integration_events(tenant_id,provider,event_key,event_type,payload_meta) values($1,'meta','legacy','whatsapp_message','{}')",[tenant]);
  await db.query("insert into integration_events(tenant_id,provider,event_key,event_type,processing_status,inbound_payload) values($1,'meta','pending','whatsapp_message','pending','{}'),($2,'meta','other-pending','whatsapp_message','pending','{}')",[tenant,other]);
  const claimed=await db.query<{event_key:string;lease_token:string;attempts:number}>('select * from crm_claim_meta_events(25,$1)',[tenant]);
  expect(claimed.rows).toHaveLength(1);expect(claimed.rows[0]).toMatchObject({event_key:'pending',attempts:1});
  expect((await db.query('select * from crm_claim_meta_events(25,$1)',[tenant])).rows).toHaveLength(0);
  await db.query("update integration_events set processing_status='failed',locked_at=null where tenant_id=$1 and event_key='pending'",[tenant]);
  expect((await db.query<{attempts:number}>('select * from crm_claim_meta_events(25,$1)',[tenant])).rows[0].attempts).toBe(2);
 });
 it('conclui mensagem e fila na mesma transação e recusa lease de outro worker',async()=>{
  const message=(await db.query<{id:string}>("insert into messages(tenant_id,conversation_id,direction,body,status,message_type) values($1,$2,'outbound','Teste','queued','text') returning id",[tenant,conversation])).rows[0].id;
  const job=(await db.query<{id:string}>("insert into outbound_message_queue(tenant_id,conversation_id,message_id,channel,payload) values($1,$2,$3,'whatsapp','{}') returning id",[tenant,conversation,message])).rows[0].id;
  const claim=(await db.query<{id:string;lease_token:string}>('select * from crm_claim_outbound_messages(25,$1)',[tenant])).rows.find(r=>r.id===job)!;
  expect((await db.query<{ok:boolean}>('select crm_complete_outbound_message($1,$2,$3,$4) as ok',[tenant,job,'00000000-0000-4000-8000-000000000099','wamid-test'])).rows[0].ok).toBe(false);
  expect((await db.query<{ok:boolean}>('select crm_complete_outbound_message($1,$2,$3,$4) as ok',[tenant,job,claim.lease_token,'wamid-test'])).rows[0].ok).toBe(true);
  expect((await db.query<{status:string;provider_message_id:string}>('select status,provider_message_id from messages where id=$1',[message])).rows[0]).toEqual({status:'sent',provider_message_id:'wamid-test'});
 });
 it('não reenvia automaticamente uma reserva abandonada de resultado externo incerto',async()=>{
  const job=(await db.query<{id:string}>("insert into outbound_message_queue(tenant_id,conversation_id,channel,payload,status,locked_at,attempts) values($1,$2,'whatsapp','{}','processing',now()-interval '6 minutes',1) returning id",[tenant,conversation])).rows[0].id;
  expect((await db.query('select * from crm_claim_outbound_messages(25,$1)',[tenant])).rows).toHaveLength(0);
  expect((await db.query<{status:string;last_error:string}>('select status,last_error from outbound_message_queue where id=$1',[job])).rows[0]).toEqual({status:'dead_letter',last_error:'delivery_outcome_unknown_reconciliation_required'});
 });
 it('conhecimento separa rascunho, publicação, histórico e restauração com proteção de conflito',async()=>{
  const document='00000000-0000-4000-8000-000000000077';
  await db.query("insert into ai_knowledge_documents(id,tenant_id,name,extracted_text) values($1,$2,'Catálogo','Conteúdo original')",[document,tenant]);
  const timestamp=async()=>(await db.query<{stamp:string}>('select updated_at::text as stamp from ai_knowledge_documents where id=$1',[document])).rows[0].stamp;
  const mutate=async(action:string,name:string|null=null,text:string|null=null,version:number|null=null)=>db.query('select crm_update_knowledge($1,$2,$3,$4,$5,$6,$7,$8)',[tenant,document,null,action,await timestamp(),name,text,version]);
  const original=await timestamp();await mutate('draft','Novo catálogo','Rascunho novo');
  expect((await db.query<{extracted_text:string}>('select extracted_text from ai_knowledge_documents where id=$1',[document])).rows[0].extracted_text).toBe('Conteúdo original');
  await expect(db.query('select crm_update_knowledge($1,$2,$3,$4,$5)',[tenant,document,null,'publish',original])).rejects.toThrow('knowledge_changed_reload');
  await mutate('publish');
  expect((await db.query<{published_version:number;extracted_text:string}>('select published_version,extracted_text from ai_knowledge_documents where id=$1',[document])).rows[0]).toEqual({published_version:2,extracted_text:'Rascunho novo'});
  await mutate('restore',null,null,1);
  expect((await db.query<{draft_text:string}>('select draft_text from ai_knowledge_documents where id=$1',[document])).rows[0].draft_text).toBe('Conteúdo original');
  await mutate('archive');expect((await db.query('select id from ai_knowledge_documents where active and published_version>0')).rows).toHaveLength(0);
 });
 it('desativar IA devolve conversas à equipe e cancela filas sem excluir mensagens',async()=>{
  await db.query("update conversations set attendance_state='automatic' where id=$1",[conversation]);
  await db.query("insert into tenant_settings(tenant_id,ai_agent_config) values($1,'{\"enabled\":true}')",[tenant]);
  await db.query("update tenant_settings set ai_agent_config='{\"enabled\":false}' where tenant_id=$1",[tenant]);
  expect((await db.query<{attendance_state:string}>('select attendance_state from conversations where id=$1',[conversation])).rows[0].attendance_state).toBe('waiting');
  expect((await db.query('select id from messages')).rows.length).toBeGreaterThan(0);
 });
});

