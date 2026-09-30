import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const schema=z.object({
  sku:z.string().trim().max(80).optional().nullable(),
  name:z.string().trim().min(2).max(160),
  description:z.string().trim().max(2000).optional().nullable(),
  unit:z.string().trim().max(40).optional().nullable(),
  price:z.coerce.number().min(0).max(999999999),
  cost:z.coerce.number().min(0).max(999999999).optional().nullable(),
  active:z.boolean().default(true)
});

export async function GET(){
  try{
    const ctx=await requirePermission('deals.view');
    const supabase=await createClient();
    const {data,error}=await supabase.from('products')
      .select('id,sku,name,description,unit,price,cost,active,created_at,updated_at')
      .eq('tenant_id',ctx.tenantId).order('name');
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'products_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('deals.update');
    const input=schema.parse(await req.json());
    const supabase=await createClient();
    const {data,error}=await supabase.from('products')
      .insert({...input,tenant_id:ctx.tenantId,updated_at:new Date().toISOString()})
      .select().single();
    if(error)throw error;
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'product.create',entity:'product',entityId:data.id});
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'product_create_failed'},{status:500});
  }
}
