import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const schema=z.object({
  name:z.string().trim().min(2).max(120),
  welcome_message:z.string().trim().min(1).max(500).default('Olá! Como podemos ajudar?'),
  active:z.boolean().default(true)
});

export async function GET(){
  try{
    const ctx=await requirePermission('settings.view');
    const supabase=await createClient();
    const {data,error}=await supabase.from('webchat_widgets')
      .select('id,public_key,name,welcome_message,active,settings,created_at')
      .eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false});
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'webchat_widgets_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('settings.manage');
    const input=schema.parse(await req.json());
    const supabase=await createClient();
    const {data,error}=await supabase.from('webchat_widgets')
      .insert({tenant_id:ctx.tenantId,...input}).select().single();
    if(error)throw error;
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'webchat_widget.create',entity:'webchat_widget',entityId:data.id});
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'webchat_widget_create_failed'},{status:500});
  }
}
