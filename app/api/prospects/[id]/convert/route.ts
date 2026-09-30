import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestLead } from '@/lib/server/lead-ingestion';
import { audit } from '@/lib/server/audit';

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const ctx=await requirePermission('contacts.create');
    const {id}=await params;
    const admin=createAdminClient();
    const {data:prospect,error}=await admin.from('prospects')
      .select('id,tenant_id,company_name,contact_name,document,website,email,phone,segment,city,state,source,status,enrichment,converted_contact_id')
      .eq('tenant_id',ctx.tenantId).eq('id',id).maybeSingle();
    if(error)throw error;
    if(!prospect)return NextResponse.json({error:'not_found'},{status:404});
    if(prospect.status==='converted'&&prospect.converted_contact_id)return NextResponse.json({data:{contact_id:prospect.converted_contact_id,already_converted:true}});

    const name=prospect.contact_name||prospect.company_name||prospect.email||prospect.phone||'Prospect';
    const result=await ingestLead({
      tenantId:ctx.tenantId,
      name,
      email:prospect.email,
      phone:prospect.phone,
      source:prospect.source||'Prospecção',
      channel:'internal',
      attribution:{
        prospect_id:prospect.id,
        company_name:prospect.company_name,
        document:prospect.document,
        website:prospect.website,
        segment:prospect.segment,
        city:prospect.city,
        state:prospect.state,
        ...(prospect.enrichment&&typeof prospect.enrichment==='object'?prospect.enrichment:{})
      },
      createConversation:false
    });

    await admin.from('prospects').update({
      status:'converted',
      converted_contact_id:result.contact?.id??null,
      updated_at:new Date().toISOString()
    }).eq('tenant_id',ctx.tenantId).eq('id',id);

    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'prospect.convert',entity:'prospect',entityId:id,metadata:{contact_id:result.contact?.id??null}});
    return NextResponse.json({data:{contact_id:result.contact?.id??null,already_converted:false}});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'prospect_convert_failed'},{status:500});
  }
}
