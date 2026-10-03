import {describe,it,expect} from 'vitest';
import {aiDecision,aiReplySchema,aiRequestKey} from '@/lib/server/ai-policy';
const base={tenant_id:'00000000-0000-4000-8000-000000000001',conversation_id:'00000000-0000-4000-8000-000000000002'};
describe('decisão de IA compatível e segura',()=>{
 it('mantém callback existente',()=>expect(aiDecision(aiReplySchema.parse({...base,body:'Olá'}))).toMatchObject({action:'respond',body:'Olá'}));
 it('aceita escalonamento sem resposta',()=>expect(aiDecision(aiReplySchema.parse({...base,action:'escalate',response:null}))).toMatchObject({action:'escalate',body:null}));
 it('baixa confiança sempre encaminha para humano',()=>expect(aiDecision(aiReplySchema.parse({...base,body:'Olá',confidence:0.3}))).toMatchObject({action:'escalate',reason:'confidence_below_threshold',body:null}));
 it('não aceita responder sem texto ou confiança impossível',()=>{
  expect(()=>aiReplySchema.parse({...base,action:'respond'})).toThrow();
  expect(()=>aiReplySchema.parse({...base,body:'Olá',confidence:2})).toThrow();
 });
 it('idempotência acompanha evento ou contexto, sem armazenar texto na chave',()=>{
  const input={tenant:'a',conversation:'b',lastInbound:'2026-10-03',action:'respond',body:'Olá'};
  expect(aiRequestKey(input)).toBe(aiRequestKey({...input}));
  expect(aiRequestKey(input)).not.toBe(aiRequestKey({...input,lastInbound:'2026-10-04'}));
  expect(aiRequestKey({...input,eventId:'event-1'})).toBe(aiRequestKey({...input,eventId:'event-1',lastInbound:'other'}));
 });
});

