import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_DAYS = new Set([7,30,90]);

export async function GET(req:Request){
  try{
    const ctx=await getRequestContext();
    const supabase=await createClient();
    const url=new URL(req.url);
    const requested=Number(url.searchParams.get('days')??30);
    const days=ALLOWED_DAYS.has(requested)?requested:30;
    const since=new Date();
    since.setDate(since.getDate()-(days-1));
    since.setHours(0,0,0,0);
    const now=new Date();
    const today=now.toISOString().slice(0,10);

    const [contacts,conversations,deals,tasks]=await Promise.all([
      supabase.from('contacts').select('id,name,status,source,owner_id,lead_score,lead_temperature,created_at').eq('tenant_id',ctx.tenantId),
      supabase.from('conversations').select('id,status,attendance_state,channel,assigned_to,sla_due_at,first_response_at,last_inbound_at,last_outbound_at,created_at').eq('tenant_id',ctx.tenantId),
      supabase.from('deals').select('id,title,stage,value,probability,owner_id,created_at,updated_at').eq('tenant_id',ctx.tenantId),
      supabase.from('tasks').select('id,title,status,priority,assigned_to,due_at,created_at').eq('tenant_id',ctx.tenantId)
    ]);

    const firstError=[contacts.error,conversations.error,deals.error,tasks.error].find(Boolean);
    if(firstError)throw firstError;

    const contactRows=contacts.data??[];
    const conversationRows=conversations.data??[];
    const dealRows=deals.data??[];
    const taskRows=tasks.data??[];

    const activeContacts=contactRows.filter(row=>row.status==='active').length;
    const leads=contactRows.filter(row=>row.status==='lead').length;
    const hotLeads=contactRows.filter(row=>row.status==='lead'&&row.lead_temperature==='hot').length;
    const openConversations=conversationRows.filter(row=>['open','pending'].includes(row.status)).length;
    const waitingConversations=conversationRows.filter(row=>['open','pending'].includes(row.status)&&row.attendance_state==='waiting').length;
    const slaBreached=conversationRows.filter(row=>row.status!=='closed'&&row.sla_due_at&&!row.first_response_at&&new Date(row.sla_due_at)<=now).length;

    const wonDeals=dealRows.filter(row=>row.stage==='won');
    const closedDeals=dealRows.filter(row=>['won','lost'].includes(row.stage));
    const conversion=closedDeals.length?Math.round((wonDeals.length/closedDeals.length)*1000)/10:0;
    const openDeals=dealRows.filter(row=>!['won','lost'].includes(row.stage));
    const openPipeline=openDeals.reduce((sum,row)=>sum+Number(row.value??0),0);
    const weightedForecast=openDeals.reduce((sum,row)=>sum+(Number(row.value??0)*Number(row.probability??0)/100),0);
    const wonRevenue=wonDeals.reduce((sum,row)=>sum+Number(row.value??0),0);
    const averageTicket=wonDeals.length?wonRevenue/wonDeals.length:0;

    const openTasks=taskRows.filter(row=>!['done','completed','closed','cancelled'].includes(String(row.status))).length;
    const overdueTasks=taskRows.filter(row=>row.due_at&&!['done','completed','closed','cancelled'].includes(String(row.status))&&new Date(row.due_at)<now).length;

    const myOpenTasks=taskRows
      .filter(row=>row.assigned_to===ctx.userId&&!['done','completed','closed','cancelled'].includes(String(row.status)))
      .sort((a,b)=>String(a.due_at??'9999').localeCompare(String(b.due_at??'9999')));
    const myTasksToday=myOpenTasks.filter(row=>row.due_at&&String(row.due_at).slice(0,10)===today);
    const myOverdue=myOpenTasks.filter(row=>row.due_at&&new Date(row.due_at)<now);
    const myHotLeads=contactRows.filter(row=>row.owner_id===ctx.userId&&row.status==='lead'&&row.lead_temperature==='hot').sort((a,b)=>Number(b.lead_score)-Number(a.lead_score));
    const myWaiting=conversationRows.filter(row=>row.assigned_to===ctx.userId&&row.status!=='closed'&&row.attendance_state==='waiting');

    const dateKeys=Array.from({length:days},(_,index)=>{
      const date=new Date(since);date.setDate(since.getDate()+index);return date.toISOString().slice(0,10);
    });
    const recentLeads=contactRows.filter(row=>row.status==='lead'&&new Date(row.created_at)>=since);
    const leadSeries=dateKeys.map(day=>({day,count:recentLeads.filter(row=>String(row.created_at).slice(0,10)===day).length}));

    const stageNames=['new','qualification','proposal','closing','won','lost'];
    const stageBreakdown=stageNames.map(stage=>({
      stage,
      count:dealRows.filter(row=>row.stage===stage).length,
      value:dealRows.filter(row=>row.stage===stage).reduce((sum,row)=>sum+Number(row.value??0),0)
    }));

    const sourceMap=new Map<string,number>();
    for(const contact of contactRows){
      const source=String(contact.source??'Não informado').trim()||'Não informado';
      sourceMap.set(source,(sourceMap.get(source)??0)+1);
    }
    const sourceBreakdown=[...sourceMap.entries()].map(([source,count])=>({source,count})).sort((a,b)=>b.count-a.count).slice(0,8);

    return NextResponse.json({data:{
      periodDays:days,activeContacts,leads,hotLeads,openConversations,waitingConversations,slaBreached,
      conversion,openPipeline,weightedForecast,wonRevenue,averageTicket,openTasks,overdueTasks,
      leadSeries,stageBreakdown,sourceBreakdown,
      myDay:{
        tasksToday:myTasksToday.slice(0,8),
        overdueTasks:myOverdue.slice(0,8),
        hotLeads:myHotLeads.slice(0,8),
        waitingConversations:myWaiting.length
      }
    }});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'dashboard_fetch_failed'},{status:500});
  }
}
