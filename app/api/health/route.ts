import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(){
  const started=Date.now();
  try{
    const admin=createAdminClient();
    const {error}=await admin.from('tenants').select('id',{head:true,count:'exact'}).limit(1);
    if(error)throw error;
    return NextResponse.json({
      status:'ok',
      service:'ecojoi-crm',
      database:'ok',
      timestamp:new Date().toISOString(),
      response_ms:Date.now()-started
    },{headers:{'cache-control':'no-store'}});
  }catch{
    return NextResponse.json({
      status:'degraded',
      service:'ecojoi-crm',
      database:'error',
      timestamp:new Date().toISOString(),
      response_ms:Date.now()-started
    },{status:503,headers:{'cache-control':'no-store'}});
  }
}
