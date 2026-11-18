import { describe,it,expect } from 'vitest';
import { detectMapping,parseImportRow } from '../lib/contact-import';
describe('importação de contatos Suri',()=>{
 it('reconhece cabeçalhos acentuados e normaliza telefone brasileiro',()=>{
  const row={'Nome do contato':'Cliente','Número do WhatsApp':'(47) 99937-1478','E-mail':'CLIENTE@EXAMPLE.COM','Responsável':'Gelson'};
  const parsed=parseImportRow(row,detectMapping(Object.keys(row)),'Suri');
  expect(parsed).toMatchObject({name:'Cliente',phone:'+5547999371478',email:'cliente@example.com',agent:'Gelson',source:'Suri',error:null});
 });
 it('aceita mapeamento personalizado e preserva DDI estrangeiro explícito',()=>{
  expect(parseImportRow({a:'Cliente',b:'+1 2025550123'},{name:'a',phone:'b'},'Suri').phone).toBe('+12025550123');
 });
 it('não cadastra linha sem identidade e rejeita telefone ou e-mail malformado',()=>{
  expect(parseImportRow({Nome:'Cliente'}, {name:'Nome'},'').error).toBeTruthy();
  expect(parseImportRow({Nome:'Cliente',Fone:'123'},{name:'Nome',phone:'Fone'},'').error).toBeTruthy();
 });
 it('reconhece evidência documentada de marketing sem inferir aceite pela origem',()=>{
  const mapping=detectMapping(['Nome','Telefone','Consentimento Marketing','Data do aceite','Origem do aceite']);
  const parsed=parseImportRow({'Nome':'Cliente','Telefone':'47999999999','Consentimento Marketing':'sim','Data do aceite':'2026-11-13','Origem do aceite':'Formulário Meta - consentimento explícito'},mapping,'Instagram Ads');
  expect(parsed).toMatchObject({consentStatus:'opt_in',consentSource:'Formulário Meta - consentimento explícito',error:null});
  expect(parsed.consentAt).toContain('2026-11-13');
  expect(parseImportRow({'Nome':'Cliente','Telefone':'47999999999'},{name:'Nome',phone:'Telefone'},'Instagram Ads').consentStatus).toBe('unknown');
 });
 it('rejeita aceite sem evidência e reconhece descadastro',()=>{
  const mapping={name:'name',phone:'phone',consent_status:'permission',consent_at:'date',consent_source:'evidence'};
  expect(parseImportRow({name:'Cliente',phone:'47999999999',permission:'sim',date:'',evidence:''},mapping,'Suri').error).toBeTruthy();
  expect(parseImportRow({name:'Cliente',phone:'47999999999',permission:'não'},mapping,'Suri').consentStatus).toBe('opt_out');
 });
});
