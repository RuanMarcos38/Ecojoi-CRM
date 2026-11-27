import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET='ecojoi-message-attachments';
const RETAINED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'image/gif', 'image/heic', 'image/heif', 'image/avif'];

export async function cleanupExpiredAttachments(tenantId?:string,limit=100,onlyThirtyDayTenants=false){
  const admin=createAdminClient();

  let settingsQuery=admin.from('tenant_settings')
    .select('tenant_id,attachment_retention_days')
    .order('tenant_id')
    .limit(500);
  if(tenantId)settingsQuery=settingsQuery.eq('tenant_id',tenantId);

  if(onlyThirtyDayTenants)settingsQuery=settingsQuery.eq('attachment_retention_days',30);

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
      .like('attachment_path',`${setting.tenant_id}/%`)
      .in('attachment_mime', RETAINED_FILE_TYPES)
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
        const bucket = admin.storage.from(BUCKET);
        const separator = path.lastIndexOf('/');
        const fileName = path.slice(separator + 1);
        const { data: objects, error: listError } = await bucket.list(path.slice(0, separator), { search: fileName, limit: 100 });
        if (listError) throw listError;
        const object = objects?.find(item => item.name === fileName && item.id);
        if (!object || !RETAINED_FILE_TYPES.includes(object.metadata?.mimetype)) continue;
        const modifiedAt = Date.parse(object.updated_at || object.created_at || '');
        if (!Number.isFinite(modifiedAt) || modifiedAt >= Date.parse(cutoff)) continue;

        const {error:removeError}=await bucket.remove([path]);
        if(removeError)throw removeError;

        const {error:updateError}=await admin.from('messages').update({
          attachment_path:null,
          attachment_name:null,
          attachment_mime:null,
          attachment_size:null,
          audio_duration_ms:null
        }).eq('tenant_id',setting.tenant_id).eq('id',message.id).eq('attachment_path',path);
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
