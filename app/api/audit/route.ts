import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
export async function GET(req:Request){try{const ctx=await requirePermission('audit.view');const limit=Math.min(200,Math.max(1,Number(new URL(req.url).searchParams.get('limit')??100)));const supabase=await createClient();const {data,error}=await supabase.from('audit_logs').select('id,user_id,action,entity,entity_id,metadata,created_at').eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false}).limit(limit);if(error)throw error;return NextResponse.json({data})}catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'audit_fetch_failed'},{status:500})}}
