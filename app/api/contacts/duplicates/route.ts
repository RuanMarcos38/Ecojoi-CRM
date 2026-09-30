import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/server/audit';

const mergeSchema=z.object({
  source_id:z.string().uuid(),
  target_id:z.string().uuid()
});

function normalizePhone(value?:string|null){return String(value??'').replace(/\D/g,'');}
function normalizeEmail(value?:string|null){return String(value??'').trim().toLowerCase();}

export async function GET(){
  try{
    const ctx=await requirePermission('contacts.view');
    const supabase=await createClient();
    const {data,error}=await supabase
      .from('contacts')
      .select('id,name,email,phone,source,status,lead_score,created_at')
      .eq('tenant_id',ctx.tenantId)
      .order('created_at',{ascending:true});
    if(error)throw error;

    const groups=new Map<string,any[]>();
    for(const contact of data??[]){
      const keys=[
        normalizePhone(contact.phone)?`phone:${normalizePhone(contact.phone)}`:'',
        normalizeEmail(contact.email)?`email:${normalizeEmail(contact.email)}`:''
      ].filter(Boolean);
      for(const key of keys){
        const list=groups.get(key)??[];
        list.push(contact);
        groups.set(key,list);
      }
    }

    const duplicates=[...groups.entries()]
      .filter(([,items])=>items.length>1)
      .map(([key,items])=>({key,items}))
      .slice(0,100);

    return NextResponse.json({data:duplicates});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'duplicates_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('contacts.update');
    const input=mergeSchema.parse(await req.json());
    const admin=createAdminClient();
    const {data,error}=await admin.rpc('merge_contacts',{
      p_tenant_id:ctx.tenantId,
      p_source_id:input.source_id,
      p_target_id:input.target_id
    });
    if(error)throw error;

    await audit({
      tenantId:ctx.tenantId,
      userId:ctx.userId,
      action:'contact.merge',
      entity:'contact',
      entityId:input.target_id,
      metadata:{source_id:input.source_id}
    });

    return NextResponse.json({data:{id:data}});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'contact_merge_failed'},{status:500});
  }
}
