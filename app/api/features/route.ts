import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { audit } from '@/lib/server/audit';
const schema=z.object({feature_name:z.string().regex(/^[a-z0-9_\-]{2,80}$/),enabled:z.boolean()});
export async function GET(){try{const ctx=await requirePermission('settings.view');const supabase=await createClient();const {data,error}=await supabase.from('feature_flags').select('feature_name,enabled').eq('tenant_id',ctx.tenantId).order('feature_name');if(error)throw error;return NextResponse.json({data})}catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'features_fetch_failed'},{status:500})}}
export async function PATCH(req:Request){try{const ctx=await requirePermission('features.manage');const body=schema.parse(await req.json());const supabase=await createClient();const {data,error}=await supabase.from('feature_flags').upsert({tenant_id:ctx.tenantId,feature_name:body.feature_name,enabled:body.enabled,updated_at:new Date().toISOString()},{onConflict:'tenant_id,feature_name'}).select().single();if(error)throw error;await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'feature.update',entity:'feature_flag',entityId:body.feature_name,metadata:{enabled:body.enabled}});return NextResponse.json({data})}catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'feature_update_failed'},{status:500})}}
