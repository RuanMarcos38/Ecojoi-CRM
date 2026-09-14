import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
export async function GET(){try{const ctx=await getRequestContext();if(ctx.role!=='super_admin')return NextResponse.json({error:'forbidden'},{status:403});const supabase=await createClient();const {data,error}=await supabase.from('tenants').select('id,name,slug,active,created_at,profiles(count)').order('created_at',{ascending:false});if(error)throw error;return NextResponse.json({data})}catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'tenants_fetch_failed'},{status:500})}}
