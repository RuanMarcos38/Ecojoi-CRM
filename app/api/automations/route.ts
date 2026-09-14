import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { requireFeature } from '@/lib/server/feature';
import { audit } from '@/lib/server/audit';

const schema=z.object({
  name:z.string().trim().min(2).max(160),
  trigger_type:z.enum(['lead_created','conversation_idle','deal_won','task_overdue']),
  action_type:z.enum(['create_task','notify_user','change_stage','internal_message']),
  enabled:z.boolean().default(true),
  config:z.record(z.unknown()).default({})
});

export async function GET(){try{const ctx=await requirePermission('automations.view');await requireFeature(ctx,'automacoes');const supabase=await createClient();const {data,error}=await supabase.from('automations').select('id,name,trigger_type,action_type,config,enabled,created_at,updated_at').eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false});if(error)throw error;return NextResponse.json({data})}catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'automations_fetch_failed'},{status:500})}}
export async function POST(req:Request){try{const ctx=await requirePermission('automations.manage');await requireFeature(ctx,'automacoes');const body=schema.parse(await req.json());const supabase=await createClient();const {data,error}=await supabase.from('automations').insert({...body,tenant_id:ctx.tenantId,created_by:ctx.userId}).select().single();if(error)throw error;await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'automation.create',entity:'automation',entityId:data.id});return NextResponse.json({data},{status:201})}catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});return NextResponse.json({error:'automation_create_failed'},{status:500})}}
