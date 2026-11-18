import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { ingestLead } from '@/lib/server/lead-ingestion';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/server/audit';
import { detectMapping, parseImportRow, type ImportMapping } from '@/lib/contact-import';

const MAX_SIZE=8*1024*1024;
const BATCH=50;
const mappingSchema=z.object({name:z.string(),phone:z.string().optional(),email:z.string().optional(),source:z.string().optional(),agent:z.string().optional(),status:z.string().optional(),notes:z.string().optional(),consent_status:z.string().optional(),consent_at:z.string().optional(),consent_source:z.string().optional()});
export async function POST(request:Request){
  try{
    const ctx=await requirePermission('contacts.create');
    const form=await request.formData();
    const source=String(form.get('source')??'').trim().slice(0,100);
    const contactOnly=form.get('contact_only')==='true'||/^suri$/i.test(source);
    const createConversation=!contactOnly&&form.get('create_conversation')==='true';
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
    if(form.get('preview')==='true')return NextResponse.json({data:{total:rows.length,headers,mapping,sample:rows.slice(0,5)}});
    if(!mapping.name || !headers.includes(mapping.name) || (!mapping.phone&&!mapping.email))return NextResponse.json({error:'Mapeie Nome e Telefone ou E-mail antes de importar.'},{status:400});
    const offset=Number(form.get('offset')??0);
    if(!Number.isSafeInteger(offset)||offset<0||offset>rows.length)return NextResponse.json({error:'Lote inválido.'},{status:400});
    let processed=0,failed=0,consentsApplied=0;
    const errors:Array<{row:number;error:string}>=[];
    for(let i=offset;i<Math.min(offset+BATCH,rows.length);i++){
      const row=parseImportRow(rows[i],mapping,source);
      if(row.error || (createConversation&&!row.phone)){failed++;errors.push({row:i+2,error:row.error??'Atendimento WhatsApp exige telefone'});continue;}
      try{
        const ingested=await ingestLead({tenantId:ctx.tenantId,name:row.name,email:row.email,phone:row.phone,source:row.source,
          channel:createConversation?'whatsapp':'internal',externalId:createConversation?row.phone?.replace(/\D/g,''):null,
          attribution:{import_file:file.name,import_source:row.source,previous_agent:row.agent,previous_status:row.status,import_notes:row.notes},
          createConversation,contactOnly,preserveExisting:true});
        if(row.consentStatus !== 'unknown' && ingested.contact?.id) {
          const admin=createAdminClient();
          const { data: existing, error: lookupError }=await admin.from('contacts')
            .select('id,consent_status,consent_at,attribution').eq('tenant_id',ctx.tenantId).eq('id',ingested.contact.id).single();
          if(lookupError)throw lookupError;
          // An opt-out must never be reversed by a later imported opt-in.
          if(row.consentStatus === 'opt_out' || existing.consent_status !== 'opt_out') {
            const recordedAt=row.consentStatus === 'opt_out' ? (row.consentAt ?? new Date().toISOString()) : row.consentAt;
            let update=admin.from('contacts').update({
              consent_status:row.consentStatus,consent_at:recordedAt,
              attribution:{...(existing.attribution ?? {}),marketing_consent_evidence:{
                source:row.consentSource || row.source,date:recordedAt,import_file:file.name
              }}
            }).eq('tenant_id',ctx.tenantId).eq('id',existing.id);
            if(row.consentStatus === 'opt_in')update=update.or('consent_status.is.null,consent_status.neq.opt_out');
            const { error: updateError }=await update;
            if(updateError)throw updateError;
            consentsApplied++;
          }
        }
        processed++;
      }catch{failed++;errors.push({row:i+2,error:'Não foi possível salvar esta linha. Tente novamente.'});}
    }
    if(consentsApplied)await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'contacts.marketing_consent.import',entity:'contacts',metadata:{file:file.name,offset,updated:consentsApplied}});
    const nextOffset=Math.min(offset+BATCH,rows.length);
    return NextResponse.json({data:{total:rows.length,processed,failed,consentsApplied,errors,nextOffset,done:nextOffset>=rows.length}});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'Importação interrompida. Confira a planilha e tente novamente.'},{status:400});}
}
