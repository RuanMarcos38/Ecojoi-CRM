import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';

export async function GET(){
  try{
    const ctx=await requirePermission('team.view');
    const supabase=await createClient();
    const {data,error}=await supabase
      .from('profiles')
      .select('id,full_name,role,active,availability_state,max_open_conversations,created_at')
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

    return NextResponse.json({data:(data??[]).map(row=>({...row,open_conversations:counts.get(row.id)??0}))});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'team_fetch_failed'},{status:500});
  }
}
