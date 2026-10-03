import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
const schema=z.object({action:z.enum(['draft','publish','archive','restore']),expected_updated_at:z.string().datetime({offset:true}),
 name:z.string().trim().min(2).max(180).optional(),text:z.string().trim().min(1).max(120000).optional(),restore_version:z.number().int().min(1).optional()
}).refine(v=>v.action!=='draft'||Boolean(v.name&&v.text)).refine(v=>v.action!=='restore'||!!v.restore_version);
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const ctx=await requirePermission('settings.view'),{id}=await params,client=await createClient();
  const {data,error}=await client.from('ai_knowledge_documents').select('id,name,extracted_text,draft_name,draft_text,published_version,version_history,active,updated_at').eq('id',id).eq('tenant_id',ctx.tenantId).maybeSingle();
  if(error)throw error;if(!data)return NextResponse.json({error:'not_found'},{status:404});
  return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'knowledge_fetch_failed'},{status:500});}
}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const ctx=await requirePermission('settings.manage'),{id}=await params,input=schema.parse(await req.json());
  const {data,error}=await createAdminClient().rpc('crm_update_knowledge',{
   p_tenant_id:ctx.tenantId,p_document_id:id,p_user_id:ctx.userId,p_action:input.action,p_expected_updated_at:input.expected_updated_at,
   p_name:input.name??null,p_text:input.text??null,p_restore_version:input.restore_version??null
  });
  if(error){
   if(error.message?.includes('knowledge_changed_reload'))return NextResponse.json({error:'knowledge_changed_reload'},{status:409});
   if(error.message?.includes('knowledge_not_found'))return NextResponse.json({error:'not_found'},{status:404});
   if(error.message?.includes('knowledge_no_draft')||error.message?.includes('knowledge_version_not_found'))return NextResponse.json({error:'knowledge_action_unavailable'},{status:409});
   throw error;
  }
  return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'knowledge_update_failed'},{status:500});}
}

