import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const schema=z.object({
  widgets:z.array(z.object({
    widget_key:z.string().trim().min(1).max(80),
    position:z.number().int().min(0).max(100),
    enabled:z.boolean().default(true),
    config:z.record(z.unknown()).default({})
  })).max(50)
});

export async function GET(){
  try{
    const ctx=await getRequestContext();
    const supabase=await createClient();
    const {data,error}=await supabase.from('user_dashboard_widgets')
      .select('id,widget_key,position,enabled,config')
      .eq('tenant_id',ctx.tenantId).eq('user_id',ctx.userId)
      .order('position',{ascending:true});
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'dashboard_widgets_fetch_failed'},{status:500});
  }
}

export async function PUT(request:Request){
  try{
    const ctx=await getRequestContext();
    const input=schema.parse(await request.json());
    const supabase=await createClient();
    const {error:deleteError}=await supabase.from('user_dashboard_widgets')
      .delete().eq('tenant_id',ctx.tenantId).eq('user_id',ctx.userId);
    if(deleteError)throw deleteError;

    if(input.widgets.length){
      const {error}=await supabase.from('user_dashboard_widgets').insert(
        input.widgets.map(widget=>({tenant_id:ctx.tenantId,user_id:ctx.userId,...widget}))
      );
      if(error)throw error;
    }
    return NextResponse.json({ok:true});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'dashboard_widgets_update_failed'},{status:500});
  }
}
