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
    // Paginate: Supabase defaults to 1,000 rows, which silently hides duplicates.
    const all: Array<{id:string;name:string;email:string|null;phone:string|null;source:string|null;status:string;lead_score:number|null;created_at:string}> = [];
    for (let offset=0;offset<100000;offset+=500) {
      const {data,error}=await supabase
        .from('contacts')
        .select('id,name,email,phone,source,status,lead_score,created_at')
        .eq('tenant_id',ctx.tenantId)
        .order('created_at',{ascending:true})
        .order('id',{ascending:true})
        .range(offset,offset+499);
      if(error)throw error;
      all.push(...(data??[]));
      if(!data || data.length<500)break;
    }

    const groups=new Map<string,typeof all>();
    for(const contact of all){
      const phone=normalizePhone(contact.phone);
      const email=normalizeEmail(contact.email);
      const keys=[phone.length>=10?`phone:${phone}`:'',email.includes('@')?`email:${email}`:''].filter(Boolean);
      for(const key of keys){
        const list=groups.get(key)??[];
        list.push(contact);
        groups.set(key,list);
      }
    }
    const duplicates=[...groups.entries()]
      .filter(([,items])=>items.length>1)
      .map(([key,items])=>({key,items}));
    const duplicateIds=[...new Set(duplicates.flatMap(group=>group.items.map(item=>item.id)))];

    return NextResponse.json({data:duplicates,summary:{groups:duplicates.length,contacts:duplicateIds.length,extra:duplicates.reduce((count,group)=>count+group.items.length-1,0)}});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'duplicates_fetch_failed'},{status:500});
  }
}

const deleteSchema=z.object({
  source_id:z.string().uuid(),
  target_id:z.string().uuid(),
  confirmation:z.literal('EXCLUIR DUPLICADO')
});

/** Permanently delete ONLY an unlinked verified duplicate. Linked records must be merged. */
export async function DELETE(req:Request){
  try{
    const ctx=await requirePermission('contacts.delete');
    const input=deleteSchema.parse(await req.json());
    if(input.source_id===input.target_id)return NextResponse.json({error:'same_contact'},{status:400});
    const admin=createAdminClient();
    const {data:contacts,error:fetchError}=await admin.from('contacts')
      .select('id,name,phone,email')
      .eq('tenant_id',ctx.tenantId)
      .in('id',[input.source_id,input.target_id]);
    if(fetchError)throw fetchError;
    if(contacts?.length!==2)return NextResponse.json({error:'contact_not_found'},{status:404});
    const source=contacts.find(row=>row.id===input.source_id)!;
    const target=contacts.find(row=>row.id===input.target_id)!;
    const phone=normalizePhone(source.phone);
    const email=normalizeEmail(source.email);
    const sharedPhone=phone.length>=10&&phone===normalizePhone(target.phone);
    const sharedEmail=email.includes('@')&&email===normalizeEmail(target.email);
    if(!sharedPhone&&!sharedEmail)return NextResponse.json({error:'not_verified_duplicate'},{status:409});

    // Never purge conversations, negotiations, tasks, tags or channel bindings.
    // Contacts with links must use the existing history-preserving merge path.
    const checks=[
      {table:'conversations',column:'contact_id'},
      {table:'deals',column:'contact_id'},
      {table:'tasks',column:'related_contact_id'},
      {table:'contact_tags',column:'contact_id'},
      {table:'contact_channels',column:'contact_id'}
    ] as const;
    for(const check of checks){
      const {count,error}=await admin.from(check.table).select('*',{count:'exact',head:true})
        .eq('tenant_id',ctx.tenantId).eq(check.column,input.source_id);
      if(error)throw error;
      if((count??0)>0)return NextResponse.json({error:'contact_has_related_records',table:check.table,merge_required:true},{status:409});
    }
    const {data:deleted,error:deleteError}=await admin.from('contacts').delete()
      .eq('tenant_id',ctx.tenantId).eq('id',input.source_id)
      .select('id').maybeSingle();
    if(deleteError)return NextResponse.json({error:'contact_has_related_records',merge_required:true},{status:409});
    if(!deleted)return NextResponse.json({error:'contact_not_found'},{status:404});
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'contact.duplicate_delete',entity:'contact',entityId:input.source_id,
      metadata:{retained_contact_id:input.target_id,matched_by:sharedPhone?'phone':'email'}});
    return NextResponse.json({ok:true,deleted_id:deleted.id,retained_id:target.id});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'duplicate_delete_failed'},{status:500});
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
