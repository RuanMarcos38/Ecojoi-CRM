import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const schema=z.object({
  name:z.string().trim().min(2).max(120),
  owner_id:z.string().uuid().optional().nullable(),
  duration_minutes:z.coerce.number().int().min(5).max(480).default(30),
  timezone:z.string().trim().min(2).max(80).default('America/Sao_Paulo'),
  day_start:z.string().regex(/^\\d{2}:\\d{2}$/).default('09:00'),
  day_end:z.string().regex(/^\\d{2}:\\d{2}$/).default('18:00'),
  interval_minutes:z.coerce.number().int().min(5).max(240).default(30),
  buffer_minutes:z.coerce.number().int().min(0).max(240).default(0),
  calendar_webhook_url:z.union([z.string().url().max(2000),z.literal(''),z.null()]).optional(),
  confirmation_message:z.string().max(500).optional().nullable()
});

export async function GET(){
  try{
    const ctx=await requirePermission('tasks.view');const supabase=await createClient();
    const {data,error}=await supabase.from('booking_pages').select('id,name,slug,owner_id,duration_minutes,timezone,available_weekdays,day_start,day_end,interval_minutes,buffer_minutes,active,calendar_webhook_url,confirmation_message,owner:profiles(id,full_name)').eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false});
    if(error)throw error;return NextResponse.json({data:data??[]});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'booking_pages_fetch_failed'},{status:500});}
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('settings.manage');const body=schema.parse(await req.json());const supabase=await createClient();
    const slug='agenda-'+randomBytes(6).toString('hex');
    const {data,error}=await supabase.from('booking_pages').insert({tenant_id:ctx.tenantId,slug,owner_id:body.owner_id??ctx.userId,...body,calendar_webhook_url:body.calendar_webhook_url||null,active:true}).select().single();
    if(error)throw error;return NextResponse.json({data},{status:201});
  }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});return NextResponse.json({error:'booking_page_create_failed'},{status:500});}
}
