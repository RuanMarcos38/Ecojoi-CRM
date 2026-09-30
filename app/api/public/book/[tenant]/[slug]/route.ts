import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestLead } from '@/lib/server/lead-ingestion';

async function resolve(tenantSlug:string,bookingSlug:string){
  const admin=createAdminClient();
  const {data:tenant}=await admin.from('tenants').select('id').eq('slug',tenantSlug).eq('active',true).maybeSingle();
  if(!tenant)return null;
  const {data:link}=await admin.from('booking_links')
    .select('id,tenant_id,owner_id,slug,name,duration_minutes,timezone,working_hours,buffer_minutes,active')
    .eq('tenant_id',tenant.id).eq('slug',bookingSlug).eq('active',true).maybeSingle();
  return link??null;
}

export async function GET(_:Request,{params}:{params:Promise<{tenant:string;slug:string}>}){
  const {tenant,slug}=await params;
  const link=await resolve(tenant,slug);
  if(!link)return NextResponse.json({error:'booking_not_found'},{status:404});
  const admin=createAdminClient();
  const from=new Date().toISOString();
  const to=new Date(Date.now()+60*86400000).toISOString();
  const {data:busy}=await admin.from('booking_requests').select('starts_at,ends_at,status')
    .eq('booking_link_id',link.id).gte('starts_at',from).lte('starts_at',to).neq('status','cancelled');
  return NextResponse.json({data:{
    name:link.name,duration_minutes:link.duration_minutes,timezone:link.timezone,
    working_hours:link.working_hours,buffer_minutes:link.buffer_minutes,busy:busy??[]
  }});
}

export async function POST(req:Request,{params}:{params:Promise<{tenant:string;slug:string}>}){
  try{
    const {tenant,slug}=await params;
    const link=await resolve(tenant,slug);
    if(!link)return NextResponse.json({error:'booking_not_found'},{status:404});
    const input=await req.json();
    const name=String(input?.name??'').trim();
    const email=String(input?.email??'').trim()||null;
    const phone=String(input?.phone??'').trim()||null;
    const startsAt=new Date(String(input?.starts_at??''));
    if(name.length<2||!Number.isFinite(startsAt.getTime())||startsAt.getTime()<Date.now()+60000){
      return NextResponse.json({error:'invalid_booking'},{status:400});
    }
    const endsAt=new Date(startsAt.getTime()+Number(link.duration_minutes)*60000);

    const lead=await ingestLead({
      tenantId:link.tenant_id,name,email,phone,source:'Agendamento',
      channel:'external',attribution:{booking_link_id:link.id},createConversation:false
    });

    const admin=createAdminClient();
    const {data:booking,error}=await admin.from('booking_requests').insert({
      tenant_id:link.tenant_id,booking_link_id:link.id,contact_id:lead.contact?.id??null,
      name,email,phone,starts_at:startsAt.toISOString(),ends_at:endsAt.toISOString(),
      notes:String(input?.notes??'').trim()||null,status:'confirmed'
    }).select('id,starts_at,ends_at,status').single();

    if(error){
      if((error as any)?.code==='23505')return NextResponse.json({error:'slot_unavailable'},{status:409});
      throw error;
    }

    await admin.from('tasks').insert({
      tenant_id:link.tenant_id,title:`Reunião - ${name}`,
      description:String(input?.notes??'').trim()||'Agendamento realizado pelo link público.',
      status:'pending',priority:'medium',assigned_to:link.owner_id??null,
      related_contact_id:lead.contact?.id??null,due_at:startsAt.toISOString()
    });

    return NextResponse.json({data:booking},{status:201});
  }catch{
    return NextResponse.json({error:'booking_create_failed'},{status:500});
  }
}
