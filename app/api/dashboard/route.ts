import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayMs = 86400000;

async function readAll<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const { data, error } = await read(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < size) return rows;
  }
}

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

    const [contactRows, conversationRows, dealRows, taskRows] = await Promise.all([
      readAll((from,to) => supabase.from('contacts').select('id,name,status,source,owner_id,lead_score,lead_temperature,created_at').eq('tenant_id',ctx.tenantId).order('id').range(from,to)),
      readAll((from,to) => supabase.from('conversations').select('id,contact_id,status,attendance_state,channel,assigned_to,sla_due_at,first_response_at,last_inbound_at,last_outbound_at,created_at').eq('tenant_id',ctx.tenantId).order('id').range(from,to)),
      readAll((from,to) => supabase.from('deals').select('id,contact_id,title,stage,value,probability,owner_id,created_at,updated_at,stage_changed_at,closed_at').eq('tenant_id',ctx.tenantId).order('id').range(from,to)),
      readAll((from,to) => supabase.from('tasks').select('id,title,status,priority,assigned_to,due_at,created_at').eq('tenant_id',ctx.tenantId).order('id').range(from,to))
    ]);

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

    function period(offset: number) {
      const start = dayFormat.format(now.getTime() - (offset + days - 1) * dayMs);
      const end = dayFormat.format(now.getTime() - offset * dayMs);
      const contains = (value: string | null | undefined) => {
        const timestamp = Date.parse(value ?? '');
        if (!Number.isFinite(timestamp)) return false;
        const day = dayFormat.format(timestamp);
        return day >= start && day <= end;
      };
      return { start, end, contains };
    }
    const current = period(0);
    const previous = period(days);
    const contactsById = new Map(contactRows.map(row => [row.id, row]));
    function summarize(window: ReturnType<typeof period>) {
      const wins = wonDeals.filter(row => window.contains(row.closed_at ?? row.stage_changed_at));
      const losses = closedDeals.filter(row => row.stage === 'lost' && window.contains(row.closed_at ?? row.stage_changed_at)).length;
      const incoming = conversationRows.filter(row => window.contains(row.created_at));
      const response = incoming.flatMap(row => {
        const delta = (Date.parse(row.first_response_at ?? '') - Date.parse(row.created_at)) / 60000;
        return Number.isFinite(delta) && delta >= 0 ? [delta] : [];
      }).sort((a,b) => a-b);
      const middle = Math.floor(response.length / 2);
      const medianResponse = response.length ? (response[middle] + response[Math.floor((response.length - 1) / 2)]) / 2 : null;
      return {
        newContacts: contactRows.filter(row => window.contains(row.created_at)).length,
        conversations: incoming.length,
        opportunities: dealRows.filter(row => window.contains(row.created_at)).length,
        wins: wins.length, losses,
        winRate: wins.length + losses ? Math.round(1000 * wins.length / (wins.length + losses)) / 10 : null,
        revenue: wins.reduce((total,row) => total + Number(row.value ?? 0), 0),
        medianResponse, responseSample: response.length
      };
    }

    const currentSummary = summarize(current);
    const trends = Array.from({length:days}, (_,i) => ({
      day: dayFormat.format(now.getTime() - (days - 1 - i) * dayMs), contacts: 0, conversations: 0, won: 0
    }));
    const byDay = new Map(trends.map(row => [row.day,row]));
    function addTrend(value: string | null | undefined, key: 'contacts' | 'conversations' | 'won') {
      if (!current.contains(value)) return;
      const bucket = byDay.get(dayFormat.format(Date.parse(value ?? '')));
      if (bucket) bucket[key]++;
    }
    for (const row of contactRows) addTrend(row.created_at,'contacts');
    for (const row of conversationRows) addTrend(row.created_at,'conversations');
    for (const row of wonDeals) addTrend(row.closed_at ?? row.stage_changed_at,'won');

    const channels = new Map<string, { channel:string; entered:number; open:number; waiting:number }>();
    for (const row of conversationRows) {
      if (!current.contains(row.created_at) && row.status === 'closed') continue;
      const channel = row.channel || 'unknown';
      const counts = channels.get(channel) ?? { channel, entered:0, open:0, waiting:0 };
      if (current.contains(row.created_at)) counts.entered++;
      if (row.status !== 'closed') counts.open++;
      if (row.status !== 'closed' && row.attendance_state === 'waiting') counts.waiting++;
      channels.set(channel,counts);
    }

    const origins = new Map<string,{source:string;contacts:number;wins:number;revenue:number}>();
    function sourceRow(source: string | null | undefined) {
      const label = source?.trim() || 'Sem origem registrada';
      const row = origins.get(label) ?? { source:label, contacts:0, wins:0, revenue:0 };
      origins.set(label,row);
      return row;
    }
    for (const row of contactRows) if (current.contains(row.created_at)) sourceRow(row.source).contacts++;
    for (const row of wonDeals) if (current.contains(row.closed_at ?? row.stage_changed_at)) {
      const bucket = sourceRow(contactsById.get(row.contact_id)?.source);
      bucket.wins++;
      bucket.revenue += Number(row.value ?? 0);
    }

    const insights = {
      start: current.start, end: current.end, previousStart: previous.start, previousEnd: previous.end,
      current: currentSummary, previous: summarize(previous), trends,
      channels: [...channels.values()].sort((a,b)=>b.entered-a.entered||b.open-a.open),
      origins: [...origins.values()].sort((a,b)=>b.contacts-a.contacts||b.revenue-a.revenue),
      risks: {
        unassigned: conversationRows.filter(row=>row.status!=='closed'&&!row.assigned_to).length,
        staleDeals: openDeals.filter(row=>now.getTime()-Date.parse(row.stage_changed_at)>2*dayMs).length,
        waitingConversations, slaBreached, overdueTasks
      }
    };

    return NextResponse.json({data:{
      periodDays:days,activeContacts,leads,hotLeads,openConversations,waitingConversations,slaBreached,
      conversion,openPipeline,weightedForecast,wonRevenue,averageTicket,openTasks,overdueTasks,
      leadSeries,stageBreakdown,sourceBreakdown,insights,
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
