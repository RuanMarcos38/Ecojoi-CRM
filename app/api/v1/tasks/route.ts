import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePublicApi } from '@/lib/server/public-api';
import { createAdminClient } from '@/lib/supabase/admin';

const schema=z.object({
  title:z.string().trim().min(2).max(180),
  description:z.string().max(2000).optional().nullable(),
  priority:z.enum(['low','medium','high']).default('medium'),
  due_at:z.string().datetime().optional().nullable(),
  related_contact_id:z.string().uuid().optional().nullable(),
  assigned_to:z.string().uuid().optional().nullable()
});

export async function GET(req:Request){
  try{
    const auth=await authenticatePublicApi(req,'tasks:read');
    const admin=createAdminClient();
    const {data,error}=await admin.from('tasks')
      .select('id,title,description,status,priority,due_at,assigned_to,related_contact_id,created_at,updated_at')
      .eq('tenant_id',auth.tenantId).order('due_at',{ascending:true,nullsFirst:false}).limit(200);
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'public_tasks_fetch_failed'},{status:500});}
}

export async function POST(req:Request){
  try{
    const auth=await authenticatePublicApi(req,'tasks:write');
    const input=schema.parse(await req.json());
    const admin=createAdminClient();
    if(input.related_contact_id){
      const {data}=await admin.from('contacts').select('id').eq('tenant_id',auth.tenantId).eq('id',input.related_contact_id).maybeSingle();
      if(!data)return NextResponse.json({error:'contact_not_found'},{status:404});
    }
    if(input.assigned_to){
      const {data}=await admin.from('profiles').select('id').eq('tenant_id',auth.tenantId).eq('id',input.assigned_to).eq('active',true).maybeSingle();
      if(!data)return NextResponse.json({error:'assignee_not_found'},{status:404});
    }
    const {data,error}=await admin.from('tasks').insert({tenant_id:auth.tenantId,...input,status:'pending'}).select().single();
    if(error)throw error;
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'public_task_create_failed'},{status:500});
  }
}
