import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
const schema=z.object({
  entity_type:z.enum(['contact','organization','deal']),
  field_key:z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_]+$/),
  label:z.string().trim().min(1).max(120),
  field_type:z.enum(['text','number','date','boolean','select','multiselect','url','email','phone']),
  required:z.boolean().default(false),
  options:z.array(z.string().max(120)).default([])
});
export async function GET(){try{const ctx=await requirePermission('settings.view');const supabase=await createClient();const {data,error}=await supabase.from('custom_field_definitions').select('*').eq('tenant_id',ctx.tenantId).eq('active',true).order('sort_order');if(error)throw error;return NextResponse.json({data:data??[]});}catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'custom_fields_fetch_failed'},{status:500});}}
export async function POST(req:Request){try{const ctx=await requirePermission('settings.manage');const body=schema.parse(await req.json());const supabase=await createClient();const {data,error}=await supabase.from('custom_field_definitions').upsert({tenant_id:ctx.tenantId,...body,active:true,updated_at:new Date().toISOString()},{onConflict:'tenant_id,entity_type,field_key'}).select().single();if(error)throw error;return NextResponse.json({data},{status:201});}catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'custom_field_save_failed'},{status:500});}}
