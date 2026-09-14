import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_DAYS = new Set([7, 30, 90]);

export async function GET(req: Request) {
  try {
    const ctx = await getRequestContext();
    const supabase = await createClient();
    const url = new URL(req.url);
    const requested = Number(url.searchParams.get('days') ?? 30);
    const days = ALLOWED_DAYS.has(requested) ? requested : 30;
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);
    const now = new Date();

    const [contacts, conversations, deals, tasks] = await Promise.all([
      supabase.from('contacts').select('status,source,created_at').eq('tenant_id', ctx.tenantId),
      supabase.from('conversations').select('status,attendance_state,channel,created_at').eq('tenant_id', ctx.tenantId),
      supabase.from('deals').select('stage,value,created_at,updated_at').eq('tenant_id', ctx.tenantId),
      supabase.from('tasks').select('status,due_at,created_at').eq('tenant_id', ctx.tenantId)
    ]);

    const firstError = [contacts.error, conversations.error, deals.error, tasks.error].find(Boolean);
    if (firstError) throw firstError;

    const contactRows = contacts.data ?? [];
    const conversationRows = conversations.data ?? [];
    const dealRows = deals.data ?? [];
    const taskRows = tasks.data ?? [];

    const activeContacts = contactRows.filter(row => row.status === 'active').length;
    const leads = contactRows.filter(row => row.status === 'lead').length;
    const openConversations = conversationRows.filter(row => ['open','pending'].includes(row.status)).length;
    const wonDeals = dealRows.filter(row => row.stage === 'won');
    const closedDeals = dealRows.filter(row => ['won','lost'].includes(row.stage));
    const conversion = closedDeals.length ? Math.round((wonDeals.length / closedDeals.length) * 1000) / 10 : 0;
    const openPipeline = dealRows.filter(row => !['won','lost'].includes(row.stage)).reduce((sum,row) => sum + Number(row.value ?? 0), 0);
    const wonRevenue = wonDeals.reduce((sum,row) => sum + Number(row.value ?? 0), 0);
    const averageTicket = wonDeals.length ? wonRevenue / wonDeals.length : 0;
    const openTasks = taskRows.filter(row => !['done','completed','closed'].includes(String(row.status))).length;
    const overdueTasks = taskRows.filter(row => row.due_at && !['done','completed','closed'].includes(String(row.status)) && new Date(row.due_at) < now).length;

    const dateKeys = Array.from({ length: days }, (_, index) => {
      const date = new Date(since);
      date.setDate(since.getDate() + index);
      return date.toISOString().slice(0, 10);
    });
    const recentLeads = contactRows.filter(row => row.status === 'lead' && new Date(row.created_at) >= since);
    const leadSeries = dateKeys.map(day => ({ day, count: recentLeads.filter(row => String(row.created_at).slice(0,10) === day).length }));

    const stageNames = ['new','qualification','proposal','closing','won','lost'];
    const stageBreakdown = stageNames.map(stage => ({ stage, count: dealRows.filter(row => row.stage === stage).length, value: dealRows.filter(row => row.stage === stage).reduce((sum,row) => sum + Number(row.value ?? 0), 0) }));

    const sourceMap = new Map<string, number>();
    for (const contact of contactRows) {
      const source = String(contact.source ?? 'Não informado').trim() || 'Não informado';
      sourceMap.set(source, (sourceMap.get(source) ?? 0) + 1);
    }
    const sourceBreakdown = [...sourceMap.entries()].map(([source,count]) => ({ source,count })).sort((a,b) => b.count - a.count).slice(0, 8);

    const attendanceStates = ['waiting','in_service','automatic'];
    const attendanceBreakdown = attendanceStates.map(state => ({ state, count: conversationRows.filter(row => row.attendance_state === state && ['open','pending'].includes(row.status)).length }));

    const channelMap = new Map<string, number>();
    for (const conversation of conversationRows.filter(row => ['open','pending'].includes(row.status))) {
      const channel = String(conversation.channel ?? 'internal');
      channelMap.set(channel, (channelMap.get(channel) ?? 0) + 1);
    }
    const channelBreakdown = [...channelMap.entries()].map(([channel,count]) => ({ channel,count })).sort((a,b) => b.count - a.count);

    return NextResponse.json({ data: {
      periodDays: days,
      activeContacts, leads, openConversations, conversion, openPipeline, wonRevenue, averageTicket,
      openTasks, overdueTasks, leadSeries, stageBreakdown, sourceBreakdown, attendanceBreakdown, channelBreakdown
    }});
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'dashboard_fetch_failed' }, { status: 500 });
  }
}
