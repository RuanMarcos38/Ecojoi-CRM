import { createAdminClient } from '@/lib/supabase/admin';

export async function recalculateLeadScores(tenantId?:string,limit=200){
  const admin=createAdminClient();
  let query=admin.from('contacts')
    .select('id,tenant_id')
    .eq('status','lead')
    .order('updated_at',{ascending:true})
    .limit(Math.min(1000,Math.max(1,limit)));
  if(tenantId)query=query.eq('tenant_id',tenantId);

  const {data,error}=await query;
  if(error)throw error;

  let succeeded=0;
  let failed=0;
  for(const contact of data??[]){
    const {error:rpcError}=await admin.rpc('recalculate_contact_score',{
      p_tenant_id:contact.tenant_id,
      p_contact_id:contact.id
    });
    if(rpcError)failed+=1;
    else succeeded+=1;
  }
  return {processed:(data??[]).length,succeeded,failed};
}
