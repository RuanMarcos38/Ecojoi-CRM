import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestLead } from '@/lib/server/lead-ingestion';
import { emitWebhookEvent } from '@/lib/server/webhook-dispatch';

const schema=z.object({
  name:z.string().trim().min(2).max(140),
  email:z.string().email().optional().nullable(),
  phone:z.string().max(40).optional().nullable(),
  starts_at:z.string().datetime(),
  notes:z.string().max(2000).optional().nullable()
});

export async function GET(req:Request,{params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const admin=createAdminClient();
  const url=new URL(req.url);
  const {data:page}=await admin.from('booking_pages').select('id,tenant_id,name,owner_id,duration_minutes,timezone,available_weekdays,day_start,day_end,interval_minutes,buffer_minutes,active,confirmation_message,owner:profiles(full_name)').eq('slug',slug).maybeSingle();
  if(!page?.active)return NextResponse.json({error:'booking_page_not_found'},{status:404});
  const date=url.searchParams.get('date');
  let occupied:string[]=[];
  if(date){
    const start=date+'T00:00:00.000Z';
    const end=date+'T23:59:59.999Z';
    const {data:bookings}=await admin.from('bookings').select('starts_at').eq('tenant_id',page.tenant_id).eq('owner_id',page.owner_id).eq('status','confirmed').gte('starts_at',start).lte('starts_at',end);
    occupied=(bookings??[]).map(b=>b.starts_at);
  }
  const owner=Array.isArray(page.owner)?page.owner[0]:page.owner;
  return NextResponse.json({data:{
    name:page.name,
    owner_name:owner?.full_name??null,
    duration_minutes:page.duration_minutes,
    timezone:page.timezone,
    available_weekdays:page.available_weekdays,
    day_start:page.day_start,
    day_end:page.day_end,
    interval_minutes:page.interval_minutes,
    buffer_minutes:page.buffer_minutes,
    confirmation_message:page.confirmation_message,
    occupied
  }});
}

export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){
  try{
    const {slug}=await params;
    const body=schema.parse(await req.json());
    const admin=createAdminClient();
    const {data:page}=await admin.from('booking_pages').select('*').eq('slug',slug).eq('active',true).maybeSingle();
    if(!page)return NextResponse.json({error:'booking_page_not_found'},{status:404});
    const starts=new Date(body.starts_at);
    if(!Number.isFinite(starts.getTime())||starts.getTime()<Date.now())return NextResponse.json({error:'invalid_slot'},{status:400});
    const ends=new Date(starts.getTime()+Number(page.duration_minutes)*60000);
    const {data:conflict}=await admin.from('bookings').select('id').eq('tenant_id',page.tenant_id).eq('owner_id',page.owner_id).eq('status','confirmed').lt('starts_at',ends.toISOString()).gt('ends_at',starts.toISOString()).limit(1).maybeSingle();
    if(conflict)return NextResponse.json({error:'slot_unavailable'},{status:409});

    const lead=await ingestLead({
      tenantId:page.tenant_id,
      name:body.name,
      email:body.email,
      phone:body.phone,
      source:'Agendamento público',
      channel:'external',
      externalName:body.name,
      createConversation:false,
      attribution:{booking_page:page.name}
    });

    const {data:booking,error}=await admin.from('bookings').insert({
      tenant_id:page.tenant_id,
      booking_page_id:page.id,
      contact_id:lead.contact?.id??null,
      owner_id:page.owner_id,
      guest_name:body.name,
      guest_email:body.email??null,
      guest_phone:body.phone??null,
      starts_at:starts.toISOString(),
      ends_at:ends.toISOString(),
      notes:body.notes??null,
      status:'confirmed'
    }).select().single();
    if(error)throw error;

    await admin.from('tasks').insert({
      tenant_id:page.tenant_id,
      title:'Reunião - '+body.name,
      description:body.notes??'Agendamento realizado pelo link público.',
      status:'pending',
      priority:'medium',
      assigned_to:page.owner_id,
      related_contact_id:lead.contact?.id??null,
      due_at:starts.toISOString()
    });

    if(page.calendar_webhook_url){
      void fetch(page.calendar_webhook_url,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({event:'ecojoi.booking.created',tenant_id:page.tenant_id,booking}),
        signal:AbortSignal.timeout(8000)
      }).catch(()=>{});
    }

    await emitWebhookEvent(page.tenant_id,'booking.created',booking.id,{
      booking_id:booking.id,
      contact_id:lead.contact?.id??null,
      starts_at:booking.starts_at,
      ends_at:booking.ends_at,
      guest_name:body.name
    });

    return NextResponse.json({data:{
      id:booking.id,
      starts_at:booking.starts_at,
      ends_at:booking.ends_at,
      message:page.confirmation_message||'Agendamento confirmado.'
    }},{status:201});
  }catch(e){
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'booking_create_failed'},{status:500});
  }
}
