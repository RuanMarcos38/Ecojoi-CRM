import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requirePermission } from '@/lib/auth/context';
import { ingestLead } from '@/lib/server/lead-ingestion';

const MAX_SIZE=8*1024*1024;
const MAX_ROWS=3000;

function value(row:Record<string,unknown>,keys:string[]){
  const normalized=new Map(Object.entries(row).map(([k,v])=>[k.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''),v]));
  for(const key of keys){
    const v=normalized.get(key);
    if(v!==undefined&&v!==null&&String(v).trim())return String(v).trim();
  }
  return null;
}

export async function POST(request:Request){
  try{
    const ctx=await requirePermission('contacts.create');
    const form=await request.formData();
    const file=form.get('file');
    if(!(file instanceof File))return NextResponse.json({error:'file_required'},{status:400});
    if(!file.size||file.size>MAX_SIZE)return NextResponse.json({error:'file_too_large'},{status:400});

    const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});
    const sheet=workbook.Sheets[workbook.SheetNames[0]??''];
    if(!sheet)return NextResponse.json({error:'sheet_not_found'},{status:400});
    const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:''}).slice(0,MAX_ROWS);

    let processed=0;
    let failed=0;
    const errors:Array<{row:number;error:string}>=[];

    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      const name=value(row,['nome','name','contato','cliente']);
      if(!name){failed++;errors.push({row:i+2,error:'nome ausente'});continue;}
      try{
        await ingestLead({
          tenantId:ctx.tenantId,
          name,
          email:value(row,['email','e-mail']),
          phone:value(row,['telefone','phone','celular','whatsapp']),
          source:value(row,['origem','source'])||'Importação',
          channel:'internal',
          attribution:{import_file:file.name},
          createConversation:false
        });
        processed++;
      }catch(e){
        failed++;
        if(errors.length<50)errors.push({row:i+2,error:e instanceof Error?e.message.slice(0,120):'erro'});
      }
    }

    return NextResponse.json({data:{total:rows.length,processed,failed,errors}});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'contacts_import_failed'},{status:500});
  }
}
