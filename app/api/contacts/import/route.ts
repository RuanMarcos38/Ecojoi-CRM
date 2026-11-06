import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { ingestLead } from '@/lib/server/lead-ingestion';
import { detectMapping, parseImportRow, type ImportMapping } from '@/lib/contact-import';

const MAX_SIZE=8*1024*1024;
const BATCH=50;
const mappingSchema=z.object({name:z.string(),phone:z.string().optional(),email:z.string().optional(),source:z.string().optional(),agent:z.string().optional(),status:z.string().optional(),notes:z.string().optional()});
export async function POST(request:Request){
  try{
    const ctx=await requirePermission('contacts.create');
    const form=await request.formData();
    const createConversation=form.get('create_conversation')==='true';
    if(createConversation)await requirePermission('conversations.create');
    const file=form.get('file');
    if(!(file instanceof File))return NextResponse.json({error:'Selecione uma planilha.'},{status:400});
    if(!file.size||file.size>MAX_SIZE)return NextResponse.json({error:'O arquivo deve ter até 8 MB.'},{status:400});
    if(!/\.(csv|xlsx|xls)$/i.test(file.name))return NextResponse.json({error:'Use CSV, XLSX ou XLS.'},{status:400});
    let workbook;
    try{workbook=XLSX.read(await file.arrayBuffer(),{type:'array',raw:true});}catch{return NextResponse.json({error:'Não foi possível ler a planilha.'},{status:400})}
    const sheet=workbook.Sheets[workbook.SheetNames[0]??''];
    if(!sheet)return NextResponse.json({error:'Planilha vazia.'},{status:400});
    const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:'',raw:false});
    const headers=[...new Set(rows.flatMap(row=>Object.keys(row)))];
    const mapping:ImportMapping=form.get('mapping')?mappingSchema.parse(JSON.parse(String(form.get('mapping')))):detectMapping(headers);
    const source=String(form.get('source')??'').trim().slice(0,100);
    if(form.get('preview')==='true')return NextResponse.json({data:{total:rows.length,headers,mapping,sample:rows.slice(0,5)}});
    if(!mapping.name || !headers.includes(mapping.name) || (!mapping.phone&&!mapping.email))return NextResponse.json({error:'Mapeie Nome e Telefone ou E-mail antes de importar.'},{status:400});
    const offset=Number(form.get('offset')??0);
    if(!Number.isSafeInteger(offset)||offset<0||offset>rows.length)return NextResponse.json({error:'Lote inválido.'},{status:400});
    let processed=0,failed=0;
    const errors:Array<{row:number;error:string}>=[];
    for(let i=offset;i<Math.min(offset+BATCH,rows.length);i++){
      const row=parseImportRow(rows[i],mapping,source);
      if(row.error || (createConversation&&!row.phone)){failed++;errors.push({row:i+2,error:row.error??'Atendimento WhatsApp exige telefone'});continue;}
      try{
        await ingestLead({tenantId:ctx.tenantId,name:row.name,email:row.email,phone:row.phone,source:row.source,
          channel:createConversation?'whatsapp':'internal',externalId:createConversation?row.phone?.replace(/\D/g,''):null,
          attribution:{import_file:file.name,import_source:row.source,previous_agent:row.agent,previous_status:row.status,import_notes:row.notes},
          createConversation,preserveExisting:true});
        processed++;
      }catch{failed++;errors.push({row:i+2,error:'Não foi possível salvar esta linha. Tente novamente.'});}
    }
    const nextOffset=Math.min(offset+BATCH,rows.length);
    return NextResponse.json({data:{total:rows.length,processed,failed,errors,nextOffset,done:nextOffset>=rows.length}});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'Importação interrompida. Confira a planilha e tente novamente.'},{status:400});}
}
