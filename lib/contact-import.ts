export const importFields = ['name','phone','email','source','agent','status','notes'] as const;
export type ImportField = typeof importFields[number];
export type ImportMapping = Partial<Record<ImportField,string>>;
const aliases: Record<ImportField,string[]> = {
  name:['nome','name','contato','cliente','nome do contato','nome do cliente','contact name'],
  phone:['telefone','phone','celular','whatsapp','numero','numero de telefone','numero do whatsapp','telefone do contato'],
  email:['email','e-mail','e mail','email do contato'], source:['origem','source'],
  agent:['atendente','responsavel','agente','operador'], status:['status','situacao','status do atendimento'],
  notes:['observacoes','notas','notes','descricao']
};
export const normalizeHeader=(v:string)=>v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[_-]/g,' ').replace(/\s+/g,' ');
export function detectMapping(headers:string[]):ImportMapping{
  return Object.fromEntries(importFields.map(field=>[field,headers.find(h=>aliases[field].some(a=>normalizeHeader(a)===normalizeHeader(h)))??'']));
}
export function parseImportRow(row:Record<string,unknown>,mapping:ImportMapping,source:string){
  const get=(field:ImportField)=>String(row[mapping[field]??'']??'').trim();
  const name=get('name');
  const rawPhone=get('phone');
  let digits=rawPhone.replace(/\D/g,'');
  if(digits.startsWith('00'))digits=digits.slice(2);
  if(!rawPhone.startsWith('+') && !rawPhone.startsWith('00') && [10,11].includes(digits.length))digits='55'+digits;
  const email=get('email').toLowerCase();
  const error=!name?'Nome ausente':(!digits&&!email)?'Informe telefone ou e-mail':digits&&(digits.length<10||digits.length>15)?'Telefone inválido':email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?'E-mail inválido':null;
  return {name,phone:digits?`+${digits}`:null,email:email||null,source:source||get('source')||'Importação',agent:get('agent'),status:get('status'),notes:get('notes'),error};
}
