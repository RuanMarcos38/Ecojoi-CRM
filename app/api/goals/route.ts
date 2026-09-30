import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const schema=z.object({user_id:z.string().uuid().optional().nullable(),period_start:z.string(),period_end:z.string(),revenue_target:z.coerce.number().min(0).default(0),deals_target:z.coerce.number().int().min(0).default(0),leads_target:z.coerce.number().int().min(0).default(0)});

export async function GET(){
  try{const ctx=await requirePermission('reports.view');const supabase=await createClient();const {data,error}=await supabase.from('sales_goals').select('id,user_id,period_start,period_end,revenue_target,deals_target,leads_target,created_at,user:profiles(id,full_name)').eq('tenant_id',ctx.tenantId).order('period_start',{ascending:false}).limit(100);if(error)throw error;return NextResponse.json({data:data??[]});}
  catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'goals_fetch_failed'},{status:500});}
}
export async function POST(req:Request){
  try{const ctx=await requirePermission('reports.view');const body=schema.parse(await req.json());const supabase=await createClient();const {data,error}=await supabase.from('sales_goals').insert({tenant_id:ctx.tenantId,...body}).select().single();if(error)throw error;return NextResponse.json({data},{status:201});}
  catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'goal_create_failed'},{status:500});}
}
