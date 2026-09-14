import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
export async function GET(){try{const ctx=await requirePermission('team.view');const supabase=await createClient();const {data,error}=await supabase.from('profiles').select('id,full_name,role,active,created_at').eq('tenant_id',ctx.tenantId).order('full_name');if(error)throw error;return NextResponse.json({data})}catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'team_fetch_failed'},{status:500})}}
