import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

export async function GET(request:Request){
  try{
    const ctx=await requirePermission('settings.view');
    const supabase=await createClient();
    const url=new URL(request.url);
    const daysRaw=Number(url.searchParams.get('days')??30);
    const days=Math.min(365,Math.max(1,Number.isFinite(daysRaw)?Math.round(daysRaw):30));
    const since=new Date(Date.now()-days*86400000).toISOString();

    const {data,error}=await supabase.from('ai_usage_logs')
      .select('provider,model,input_tokens,output_tokens,total_tokens,estimated_cost,created_at')
      .eq('tenant_id',ctx.tenantId)
      .gte('created_at',since)
      .order('created_at',{ascending:false})
      .limit(5000);

    if(error)throw error;
    const rows=data??[];
    const byModel=new Map<string,{requests:number;input:number;output:number;tokens:number;cost:number}>();
    let inputTokens=0,outputTokens=0,totalTokens=0,cost=0;

    for(const row of rows){
      const input=Number(row.input_tokens??0);
      const output=Number(row.output_tokens??0);
      const total=Number(row.total_tokens??0);
      const estimated=Number(row.estimated_cost??0);
      inputTokens+=input;outputTokens+=output;totalTokens+=total;cost+=estimated;
      const key=[row.provider||'external',row.model||'não informado'].join(' / ');
      const current=byModel.get(key)??{requests:0,input:0,output:0,tokens:0,cost:0};
      current.requests+=1;current.input+=input;current.output+=output;current.tokens+=total;current.cost+=estimated;
      byModel.set(key,current);
    }

    return NextResponse.json({
      data:{
        days,
        requests:rows.length,
        input_tokens:inputTokens,
        output_tokens:outputTokens,
        total_tokens:totalTokens,
        estimated_cost:Number(cost.toFixed(6)),
        by_model:[...byModel.entries()].map(([name,value])=>({name,...value,cost:Number(value.cost.toFixed(6))}))
      }
    });
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'ai_usage_fetch_failed'},{status:500});
  }
}
