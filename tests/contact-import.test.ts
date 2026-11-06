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
});
