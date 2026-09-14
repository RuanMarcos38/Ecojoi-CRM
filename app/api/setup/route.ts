import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const schema=z.object({
  company_name:z.string().trim().min(2).max(140),
  company_slug:z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  full_name:z.string().trim().min(2).max(140)
});

export async function POST(req:Request){
  try{
    const supabase=await createClient();
    const {data:{user},error:userError}=await supabase.auth.getUser();
    if(userError||!user)return NextResponse.json({error:'unauthorized'},{status:401});
    const body=schema.parse(await req.json());
    const {data,error}=await supabase.rpc('bootstrap_tenant',{p_company_name:body.company_name,p_company_slug:body.company_slug,p_full_name:body.full_name});
    if(error){
      if(error.message.includes('profile_already_exists')) return NextResponse.json({error:'profile_already_exists'},{status:409});
      if(error.message.includes('duplicate key')) return NextResponse.json({error:'company_slug_in_use'},{status:409});
      throw error;
    }
    return NextResponse.json({data:{tenant_id:data}},{status:201});
  }catch(e){
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'setup_failed'},{status:500});
  }
}