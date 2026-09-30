import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

export async function GET(request:Request){
  try{
    const ctx=await requirePermission('contacts.view');
    const supabase=await createClient();
    const {data,error}=await supabase
      .from('contacts')
      .select('name,email,phone,source,status,lead_score,lead_temperature,consent_status,created_at,owner:profiles!contacts_owner_id_fkey(full_name),organization:organizations!contacts_organization_id_fkey(name,document)')
      .eq('tenant_id',ctx.tenantId)
      .order('created_at',{ascending:false})
      .limit(20000);
    if(error)throw error;

    const rows=(data??[]).map((row:any)=>({
      Nome:row.name,
      Email:row.email??'',
      Telefone:row.phone??'',
      Origem:row.source??'',
      Status:row.status,
      Score:row.lead_score??0,
      Temperatura:row.lead_temperature??'',
      Consentimento:row.consent_status??'unknown',
      Responsavel:(Array.isArray(row.owner)?row.owner[0]?.full_name:row.owner?.full_name)??'',
      Empresa:(Array.isArray(row.organization)?row.organization[0]?.name:row.organization?.name)??'',
      CNPJ:(Array.isArray(row.organization)?row.organization[0]?.document:row.organization?.document)??'',
      Criado_em:row.created_at
    }));

    const format=new URL(request.url).searchParams.get('format')==='csv'?'csv':'xlsx';
    const worksheet=XLSX.utils.json_to_sheet(rows);
    const workbook=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook,worksheet,'Contatos');

    if(format==='csv'){
      const csv='\uFEFF'+XLSX.utils.sheet_to_csv(worksheet,{FS:';'});
      return new Response(csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="ecojoi-contatos.csv"'}});
    }

    const bytes=XLSX.write(workbook,{type:'buffer',bookType:'xlsx'});
    return new Response(bytes,{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':'attachment; filename="ecojoi-contatos.xlsx"'}});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'contacts_export_failed'},{status:500});
  }
}
