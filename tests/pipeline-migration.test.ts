import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
let db:PGlite;
const tenant='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',pipeline='00000000-0000-4000-8000-000000000010',legacy='00000000-0000-4000-8000-000000000011',custom='00000000-0000-4000-8000-000000000012',unused='00000000-0000-4000-8000-000000000013';
const migration=()=>readFile(new URL('../database/migrations/031_pipeline_stage_controls.sql',import.meta.url),'utf8');
beforeAll(async()=>{
 db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create table pipelines(id uuid primary key,tenant_id uuid,is_default boolean);
 create table pipeline_stages_v2(id uuid primary key,tenant_id uuid,pipeline_id uuid,name text,stage_key text,sort_order integer,probability integer,is_won boolean,is_lost boolean);
 create table deals(id uuid primary key default gen_random_uuid(),tenant_id uuid,stage text,pipeline_id uuid,pipeline_stage_id uuid,probability integer,stage_changed_at timestamptz);
 `);
 await db.query('insert into pipelines values($1,$2,true)',[pipeline,tenant]);
 await db.query("insert into pipeline_stages_v2 values($1,$4,$5,'Novo','new',10,10,false,false),($2,$4,$5,'Visita técnica','visita',20,40,false,false),($3,$4,$5,'Retirável','retiravel',30,50,false,false)",[legacy,custom,unused,tenant,pipeline]);
 await db.exec(await migration());
},60000);
afterAll(async()=>{await db?.close();});
describe('pipeline existente e etapas personalizadas',()=>{
 it('reutiliza dados e preserva categorias de relatórios sem duplicar etapas',async()=>{
  expect((await db.query('select id from pipelines')).rows).toHaveLength(1);
  expect((await db.query('select id from pipeline_stages_v2')).rows).toHaveLength(3);
  expect((await db.query<{semantic_stage:string}>('select semantic_stage from pipeline_stages_v2 where id=$1',[custom])).rows[0].semantic_stage).toBe('qualification');
  await db.exec(await migration());expect((await db.query('select id from pipeline_stages_v2')).rows).toHaveLength(3);
 });
 it('bloqueia retirada de etapa padrão ocupada por oportunidades legadas',async()=>{
  await db.query("insert into deals(tenant_id,stage) values($1,'new')",[tenant]);
  await expect(db.query('update pipeline_stages_v2 set active=false where id=$1',[legacy])).rejects.toThrow('pipeline_stage_in_use');
 });
 it('não aceita etapa de outra empresa',async()=>{
  await expect(db.query('insert into deals(tenant_id,pipeline_stage_id) values($1,$2)',[other,custom])).rejects.toThrow('pipeline_stage_invalid');
 });
 it('vincula etapa personalizada e categoria antiga na mesma gravação',async()=>{
  await db.query('insert into deals(tenant_id,pipeline_stage_id) values($1,$2)',[tenant,custom]);
  expect((await db.query<{stage:string;pipeline_id:string;probability:number}>('select stage,pipeline_id,probability from deals where pipeline_stage_id=$1',[custom])).rows[0]).toEqual({stage:'qualification',pipeline_id:pipeline,probability:40});
 });
 it('não permite retirada nem exclusão de etapa utilizada',async()=>{
  await expect(db.query('update pipeline_stages_v2 set active=false where id=$1',[custom])).rejects.toThrow('pipeline_stage_in_use');
  await expect(db.query('delete from pipeline_stages_v2 where id=$1',[custom])).rejects.toThrow('pipeline_stage_in_use');
 });
 it('preserva probabilidade explicitamente informada ao criar oportunidade',async()=>{
  const row=await db.query<{probability:number}>('insert into deals(tenant_id,pipeline_stage_id,probability) values($1,$2,73) returning probability',[tenant,custom]);
  expect(row.rows[0].probability).toBe(73);
 });
 it('retira etapa vazia preservando registro e impede novos vínculos',async()=>{
  await db.query('update pipeline_stages_v2 set active=false where id=$1',[unused]);
  expect((await db.query('select id from pipeline_stages_v2 where id=$1',[unused])).rows).toHaveLength(1);
  await expect(db.query('insert into deals(tenant_id,pipeline_stage_id) values($1,$2)',[tenant,unused])).rejects.toThrow('pipeline_stage_invalid');
 });
 it('funções privilegiadas não são invocáveis pelo navegador',async()=>{
  expect((await db.query<{allowed:boolean}>("select has_function_privilege('authenticated','public.crm_bind_deal_stage()','execute') as allowed")).rows[0].allowed).toBe(false);
 });
});

