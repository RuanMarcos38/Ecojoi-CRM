import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET='ecojoi-message-attachments';

export async function cleanupExpiredAttachments(tenantId?:string,limit=100){
  const admin=createAdminClient();

  let settingsQuery=admin.from('tenant_settings')
    .select('tenant_id,attachment_retention_days')
    .order('tenant_id')
    .limit(500);
  if(tenantId)settingsQuery=settingsQuery.eq('tenant_id',tenantId);

  const {data:settings,error:settingsError}=await settingsQuery;
  if(settingsError)throw settingsError;

  let inspected=0;
  let removed=0;
  let failed=0;
  const failures:string[]=[];

  for(const setting of settings??[]){
    if(inspected>=limit)break;
    const days=Math.min(3650,Math.max(30,Number(setting.attachment_retention_days??365)));
    const cutoff=new Date(Date.now()-days*86400000).toISOString();
    const remaining=Math.max(1,limit-inspected);

    const {data:messages,error}=await admin.from('messages')
      .select('id,attachment_path,created_at')
      .eq('tenant_id',setting.tenant_id)
      .not('attachment_path','is',null)
      .lt('created_at',cutoff)
      .order('created_at',{ascending:true})
      .limit(remaining);

    if(error){
      failed+=1;
      failures.push(`${setting.tenant_id}:query`);
      continue;
    }

    for(const message of messages??[]){
      inspected+=1;
      const path=message.attachment_path;
      if(!path)continue;
      try{
        const {error:removeError}=await admin.storage.from(BUCKET).remove([path]);
        if(removeError)throw removeError;

        const {error:updateError}=await admin.from('messages').update({
          attachment_path:null,
          attachment_name:null,
          attachment_mime:null,
          attachment_size:null,
          audio_duration_ms:null
        }).eq('tenant_id',setting.tenant_id).eq('id',message.id);
        if(updateError)throw updateError;
        removed+=1;
      }catch{
        failed+=1;
        failures.push(message.id);
      }
      if(inspected>=limit)break;
    }
  }

  return {inspected,removed,failed,failures:failures.slice(0,20)};
}
