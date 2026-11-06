import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';

export async function GET(){
  try{
    const ctx=await requirePermission('team.view');
    const supabase=await createClient();
    const {data,error}=await supabase
      .from('profiles')
      .select('id,full_name,role,active,availability_state,max_open_conversations,created_at,deleted_at')
      .eq('tenant_id',ctx.tenantId)
      .order('full_name');
    if(error)throw error;

    const {data:conversations}=await supabase
      .from('conversations')
      .select('assigned_to,status')
      .eq('tenant_id',ctx.tenantId)
      .neq('status','closed');

    const counts=new Map<string,number>();
    for(const conversation of conversations??[]){
      if(conversation.assigned_to)counts.set(conversation.assigned_to,(counts.get(conversation.assigned_to)??0)+1);
    }

    const master=ctx.role==='company_admin'||ctx.role==='super_admin';
    const identities=new Map<string,{email:string;confirmed:boolean}>();
    if(master){
      const admin=createAdminClient();
      // Read only users already belonging to this tenant, never a global user directory.
      for(let start=0;start<(data??[]).length;start+=10){
        await Promise.all((data??[]).slice(start,start+10).map(async row=>{
          const {data:auth}=await admin.auth.admin.getUserById(row.id);
          if(auth?.user)identities.set(row.id,{email:auth.user.email??'',confirmed:!!auth.user.email_confirmed_at});
        }));
      }
    }
    return NextResponse.json({data:(data??[]).map(row=>({...row,...identities.get(row.id),open_conversations:counts.get(row.id)??0})),viewer:{id:ctx.userId,role:ctx.role}},{headers:{'Cache-Control':'no-store'}});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'team_fetch_failed'},{status:500});
  }
}
