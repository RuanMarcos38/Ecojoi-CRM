import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const schema=z.object({
  survey_id:z.string().uuid(),
  contact_id:z.string().uuid().optional().nullable(),
  expires_in_days:z.coerce.number().int().min(1).max(365).default(30)
});

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('reports.view');
    const input=schema.parse(await req.json());
    const supabase=await createClient();
    const {data:survey}=await supabase.from('customer_surveys').select('id').eq('tenant_id',ctx.tenantId).eq('id',input.survey_id).maybeSingle();
    if(!survey)return NextResponse.json({error:'survey_not_found'},{status:404});
    if(input.contact_id){
      const {data:contact}=await supabase.from('contacts').select('id').eq('tenant_id',ctx.tenantId).eq('id',input.contact_id).maybeSingle();
      if(!contact)return NextResponse.json({error:'contact_not_found'},{status:404});
    }
    const expiresAt=new Date(Date.now()+input.expires_in_days*86400000).toISOString();
    const {data,error}=await supabase.from('customer_survey_invitations')
      .insert({tenant_id:ctx.tenantId,survey_id:input.survey_id,contact_id:input.contact_id??null,expires_at:expiresAt})
      .select('id,token,expires_at').single();
    if(error)throw error;
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'survey.invite',entity:'survey',entityId:input.survey_id,metadata:{contact_id:input.contact_id??null}});
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'survey_invite_failed'},{status:500});
  }
}
