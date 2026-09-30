import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

export async function GET(req:Request){
  try{
    const ctx=await requirePermission('contacts.view');
    const q=new URL(req.url).searchParams.get('q')?.trim()??'';
    if(q.length<2)return NextResponse.json({data:[]});

    const term=q.slice(0,80).replace(/[,%()]/g,' ');
    const supabase=await createClient();
    const [contacts,deals,tasks,messages]=await Promise.all([
      supabase.from('contacts')
        .select('id,name,email,phone,status')
        .eq('tenant_id',ctx.tenantId)
        .or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(6),
      supabase.from('deals')
        .select('id,title,stage,value')
        .eq('tenant_id',ctx.tenantId)
        .ilike('title',`%${term}%`)
        .limit(5),
      supabase.from('tasks')
        .select('id,title,status,due_at')
        .eq('tenant_id',ctx.tenantId)
        .ilike('title',`%${term}%`)
        .limit(5),
      supabase.from('messages')
        .select('id,conversation_id,body,created_at')
        .eq('tenant_id',ctx.tenantId)
        .ilike('body',`%${term}%`)
        .order('created_at',{ascending:false})
        .limit(5)
    ]);

    const data:any[]=[];
    for(const row of contacts.data??[])data.push({id:row.id,type:'contact',title:row.name,subtitle:row.phone??row.email??row.status,href:'/app/contatos'});
    for(const row of deals.data??[])data.push({id:row.id,type:'deal',title:row.title,subtitle:`Negócio · ${row.stage}`,href:'/app/pipeline'});
    for(const row of tasks.data??[])data.push({id:row.id,type:'task',title:row.title,subtitle:`Tarefa · ${row.status}`,href:'/app/tarefas'});
    for(const row of messages.data??[])data.push({id:row.id,type:'message',title:String(row.body).slice(0,90),subtitle:'Mensagem',href:'/app/atendimento'});

    return NextResponse.json({data:data.slice(0,18)});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'search_failed'},{status:500});
  }
}
