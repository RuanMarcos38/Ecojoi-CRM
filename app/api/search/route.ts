import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
export async function GET(req:Request){
  try{
    const ctx=await requirePermission('contacts.view');const q=new URL(req.url).searchParams.get('q')?.trim()??'';
    if(q.length<2)return NextResponse.json({data:[]});
    const supabase=await createClient();
    const {data,error}=await supabase.from('contacts').select('id,name,email,phone,status').eq('tenant_id',ctx.tenantId).ilike('name',`%${q.slice(0,80)}%`).limit(8);
    if(error)throw error;return NextResponse.json({data});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'search_failed'},{status:500})}
}