import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { requireFeature } from '@/lib/server/feature';

export async function GET(){
  try{
    const ctx=await requirePermission('reports.view');
    await requireFeature(ctx,'relatorios');
    const supabase=await createClient();

    const [deals,tasks,conversations,contacts,goals]=await Promise.all([
      supabase.from('deals').select('stage,value,probability,contact:contacts(source)').eq('tenant_id',ctx.tenantId),
      supabase.from('tasks').select('status,priority,due_at').eq('tenant_id',ctx.tenantId),
      supabase.from('conversations').select('status,channel,created_at,last_inbound_at,first_response_at,sla_due_at').eq('tenant_id',ctx.tenantId),
      supabase.from('contacts').select('status,source,lead_temperature,lead_score,created_at').eq('tenant_id',ctx.tenantId),
      supabase.from('sales_goals').select('id,user_id,period_start,period_end,revenue_target,deals_target,leads_target').eq('tenant_id',ctx.tenantId).lte('period_start',new Date().toISOString().slice(0,10)).gte('period_end',new Date().toISOString().slice(0,10))
    ]);

    const err=[deals.error,tasks.error,conversations.error,contacts.error,goals.error].find(Boolean);
    if(err)throw err;

    const ds=deals.data??[];
    const ts=tasks.data??[];
    const cs=conversations.data??[];
    const xs=contacts.data??[];
    const won=ds.filter(d=>d.stage==='won');
    const lost=ds.filter(d=>d.stage==='lost');
    const closed=[...won,...lost];

    const openPipeline=ds.filter(d=>!['won','lost'].includes(d.stage)).reduce((s,d)=>s+Number(d.value??0),0);
    const weightedForecast=ds.filter(d=>!['won','lost'].includes(d.stage)).reduce((s,d)=>s+(Number(d.value??0)*Number(d.probability??0)/100),0);
    const wonRevenue=won.reduce((s,d)=>s+Number(d.value??0),0);
    const conversionRate=closed.length?Math.round((won.length/closed.length)*1000)/10:0;
    const averageTicket=won.length?wonRevenue/won.length:0;

    const overdue=ts.filter(t=>t.status!=='done'&&t.status!=='cancelled'&&t.due_at&&new Date(t.due_at)<new Date()).length;
    const openConversations=cs.filter(c=>c.status!=='closed').length;
    const slaBreached=cs.filter(c=>c.status!=='closed'&&c.sla_due_at&&!c.first_response_at&&new Date(c.sla_due_at)<=new Date()).length;

    const responseMinutes=cs
      .filter(c=>c.last_inbound_at&&c.first_response_at)
      .map(c=>(new Date(c.first_response_at!).getTime()-new Date(c.last_inbound_at!).getTime())/60000)
      .filter(v=>Number.isFinite(v)&&v>=0&&v<24*60);
    const averageFirstResponseMinutes=responseMinutes.length
      ? Math.round((responseMinutes.reduce((a,b)=>a+b,0)/responseMinutes.length)*10)/10
      : 0;

    const leads=xs.filter(c=>c.status==='lead').length;
    const active=xs.filter(c=>c.status==='active').length;
    const hotLeads=xs.filter(c=>c.status==='lead'&&c.lead_temperature==='hot').length;

    const sourceMap=new Map<string,{contacts:number;won:number;revenue:number}>();
    for(const contact of xs){
      const source=String(contact.source??'Não informado').trim()||'Não informado';
      const current=sourceMap.get(source)??{contacts:0,won:0,revenue:0};
      current.contacts+=1;
      sourceMap.set(source,current);
    }
    for(const deal of won){
      const relation=Array.isArray(deal.contact)?deal.contact[0]:deal.contact;
      const source=String(relation?.source??'Não informado').trim()||'Não informado';
      const current=sourceMap.get(source)??{contacts:0,won:0,revenue:0};
      current.won+=1;
      current.revenue+=Number(deal.value??0);
      sourceMap.set(source,current);
    }
    const sourcePerformance=[...sourceMap.entries()].map(([source,v])=>({
      source,...v,
      conversion:v.contacts?Math.round((v.won/v.contacts)*1000)/10:0
    })).sort((a,b)=>b.revenue-a.revenue||b.contacts-a.contacts);

    return NextResponse.json({data:{
      openPipeline,weightedForecast,wonRevenue,conversionRate,averageTicket,
      overdue,openConversations,slaBreached,averageFirstResponseMinutes,
      leads,active,hotLeads,totalContacts:xs.length,totalDeals:ds.length,
      sourcePerformance,goals:goals.data??[]
    }});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'reports_fetch_failed'},{status:500});
  }
}
