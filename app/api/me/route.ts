import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { rolePermissions } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';

export async function GET(){
  try{
    const ctx=await getRequestContext();
    const supabase=await createClient();
    const [{data:profile,error:profileError},{data:tenant,error:tenantError},{data:flags,error:flagsError}]=await Promise.all([
      supabase.from('profiles').select('full_name,role,active').eq('id',ctx.userId).eq('tenant_id',ctx.tenantId).single(),
      supabase.from('tenants').select('name,slug,active').eq('id',ctx.tenantId).single(),
      supabase.from('feature_flags').select('feature_name,enabled').eq('tenant_id',ctx.tenantId)
    ]);
    if(profileError||tenantError||flagsError) throw profileError??tenantError??flagsError;
    return NextResponse.json({data:{...ctx,fullName:profile.full_name,companyName:tenant.name,companySlug:tenant.slug,permissions:rolePermissions[ctx.role],features:Object.fromEntries((flags??[]).map(f=>[f.feature_name,f.enabled]))}});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'me_fetch_failed'},{status:500});
  }
}