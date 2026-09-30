import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
const schema=z.object({name:z.string().trim().min(2).max(120),welcome_message:z.string().max(500).optional().nullable(),accent_color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),allowed_origins:z.array(z.string().max(300)).default([])});
export async function GET(){try{const ctx=await requirePermission('settings.view');const supabase=await createClient();const {data,error}=await supabase.from('webchat_widgets').select('*').eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false});if(error)throw error;return NextResponse.json({data:data??[]});}catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'widgets_fetch_failed'},{status:500});}}
export async function POST(req:Request){try{const ctx=await requirePermission('settings.manage');const body=schema.parse(await req.json());const supabase=await createClient();const {data,error}=await supabase.from('webchat_widgets').insert({tenant_id:ctx.tenantId,...body,public_key:'wc_'+randomBytes(18).toString('base64url'),active:true}).select().single();if(error)throw error;return NextResponse.json({data},{status:201});}catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'widget_create_failed'},{status:500});}}
