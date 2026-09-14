import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { requireFeature } from '@/lib/server/feature';

export async function GET(){
  try{
    const ctx=await requirePermission('reports.view');
    await requireFeature(ctx,'relatorios');
    const supabase=await createClient();
    const [deals,tasks,conversations,contacts]=await Promise.all([
      supabase.from('deals').select('stage,value,probability').eq('tenant_id',ctx.tenantId),
      supabase.from('tasks').select('status,priority,due_at').eq('tenant_id',ctx.tenantId),
      supabase.from('conversations').select('status,channel,created_at,updated_at').eq('tenant_id',ctx.tenantId),
      supabase.from('contacts').select('status,source,created_at').eq('tenant_id',ctx.tenantId)
    ]);
    const err=[deals.error,tasks.error,conversations.error,contacts.error].find(Boolean); if(err) throw err;
    const ds=deals.data??[]; const ts=tasks.data??[]; const cs=conversations.data??[]; const xs=contacts.data??[];
    const openPipeline=ds.filter(d=>!['won','lost'].includes(d.stage)).reduce((s,d)=>s+Number(d.value??0),0);
    const wonRevenue=ds.filter(d=>d.stage==='won').reduce((s,d)=>s+Number(d.value??0),0);
    const overdue=ts.filter(t=>t.status!=='done'&&t.status!=='cancelled'&&t.due_at&&new Date(t.due_at)<new Date()).length;
    const openConversations=cs.filter(c=>c.status!=='closed').length;
    const leads=xs.filter(c=>c.status==='lead').length;
    const active=xs.filter(c=>c.status==='active').length;
    return NextResponse.json({data:{openPipeline,wonRevenue,overdue,openConversations,leads,active,totalContacts:xs.length,totalDeals:ds.length}});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'reports_fetch_failed'},{status:500})}
}