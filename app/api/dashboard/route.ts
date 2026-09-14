import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

export async function GET(){
  try{
    const ctx=await getRequestContext();
    const supabase=await createClient();
    const since=new Date(); since.setDate(since.getDate()-6); since.setHours(0,0,0,0);
    const [contacts,leads,conversations,deals,recentLeads]=await Promise.all([
      supabase.from('contacts').select('*',{count:'exact',head:true}).eq('tenant_id',ctx.tenantId).eq('status','active'),
      supabase.from('contacts').select('*',{count:'exact',head:true}).eq('tenant_id',ctx.tenantId).eq('status','lead'),
      supabase.from('conversations').select('*',{count:'exact',head:true}).eq('tenant_id',ctx.tenantId).in('status',['open','pending']),
      supabase.from('deals').select('stage,value').eq('tenant_id',ctx.tenantId),
      supabase.from('contacts').select('created_at').eq('tenant_id',ctx.tenantId).eq('status','lead').gte('created_at',since.toISOString())
    ]);
    const firstError=[contacts.error,leads.error,conversations.error,deals.error,recentLeads.error].find(Boolean); if(firstError)throw firstError;
    const dealRows=deals.data??[];
    const won=dealRows.filter(d=>d.stage==='won').length;
    const closed=dealRows.filter(d=>d.stage==='won'||d.stage==='lost').length;
    const conversion=closed?Math.round((won/closed)*1000)/10:0;
    const openPipeline=dealRows.filter(d=>!['won','lost'].includes(d.stage)).reduce((sum,d)=>sum+Number(d.value??0),0);
    const days=Array.from({length:7},(_,i)=>{const d=new Date(since);d.setDate(since.getDate()+i);return d.toISOString().slice(0,10)});
    const leadSeries=days.map(day=>({day,count:(recentLeads.data??[]).filter(x=>String(x.created_at).slice(0,10)===day).length}));
    return NextResponse.json({data:{activeContacts:contacts.count??0,leads:leads.count??0,openConversations:conversations.count??0,conversion,openPipeline,leadSeries}});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'dashboard_fetch_failed'},{status:500})}
}