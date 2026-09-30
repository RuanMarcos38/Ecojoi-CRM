import { NextResponse } from 'next/server';
import { authenticatePublicApi } from '@/lib/server/public-api';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req:Request){
  try{
    const auth=await authenticatePublicApi(req,'reports:read');
    const admin=createAdminClient();
    const [contacts,deals,tasks,conversations]=await Promise.all([
      admin.from('contacts').select('id,status,source,lead_temperature').eq('tenant_id',auth.tenantId),
      admin.from('deals').select('id,stage,value,probability').eq('tenant_id',auth.tenantId),
      admin.from('tasks').select('id,status,due_at').eq('tenant_id',auth.tenantId),
      admin.from('conversations').select('id,status,attendance_state,sla_due_at,first_response_at').eq('tenant_id',auth.tenantId)
    ]);
    const err=[contacts.error,deals.error,tasks.error,conversations.error].find(Boolean);if(err)throw err;
    const cs=contacts.data??[],ds=deals.data??[],ts=tasks.data??[],xs=conversations.data??[];
    const won=ds.filter(d=>d.stage==='won'),closed=ds.filter(d=>['won','lost'].includes(d.stage));
    const now=new Date();
    const data={
      contacts:cs.length,
      leads:cs.filter(c=>c.status==='lead').length,
      hot_leads:cs.filter(c=>c.status==='lead'&&c.lead_temperature==='hot').length,
      open_conversations:xs.filter(c=>c.status!=='closed').length,
      sla_breached:xs.filter(c=>c.status!=='closed'&&c.sla_due_at&&!c.first_response_at&&new Date(c.sla_due_at)<=now).length,
      open_pipeline:ds.filter(d=>!['won','lost'].includes(d.stage)).reduce((s,d)=>s+Number(d.value??0),0),
      weighted_forecast:ds.filter(d=>!['won','lost'].includes(d.stage)).reduce((s,d)=>s+Number(d.value??0)*Number(d.probability??0)/100,0),
      won_revenue:won.reduce((s,d)=>s+Number(d.value??0),0),
      conversion_rate:closed.length?Math.round(won.length/closed.length*1000)/10:0,
      overdue_tasks:ts.filter(t=>t.status!=='done'&&t.status!=='cancelled'&&t.due_at&&new Date(t.due_at)<now).length
    };
    return NextResponse.json({data});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'public_reports_fetch_failed'},{status:500});}
}
