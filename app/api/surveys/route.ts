import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const createSchema=z.object({name:z.string().trim().min(2).max(120),survey_type:z.enum(['nps','csat']),question:z.string().trim().min(2).max(500)});
const responseSchema=z.object({survey_id:z.string().uuid(),contact_id:z.string().uuid().optional().nullable(),conversation_id:z.string().uuid().optional().nullable(),score:z.coerce.number().int().min(0).max(10),comment:z.string().max(2000).optional().nullable()});

export async function GET(){
  try{const ctx=await requirePermission('reports.view');const supabase=await createClient();
    const [{data:surveys,error:sErr},{data:responses,error:rErr}]=await Promise.all([
      supabase.from('surveys').select('id,name,survey_type,question,active,created_at').eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false}),
      supabase.from('survey_responses').select('id,survey_id,score,comment,created_at').eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false}).limit(500)
    ]);
    if(sErr||rErr)throw sErr??rErr;
    const data=(surveys??[]).map(s=>{const rs=(responses??[]).filter(r=>r.survey_id===s.id);const avg=rs.length?Math.round((rs.reduce((a,r)=>a+Number(r.score),0)/rs.length)*10)/10:0;return {...s,responses:rs.length,average:avg};});
    return NextResponse.json({data});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'surveys_fetch_failed'},{status:500});}
}
export async function POST(req:Request){
  try{const ctx=await requirePermission('settings.manage');const body=createSchema.parse(await req.json());const supabase=await createClient();const {data,error}=await supabase.from('surveys').insert({tenant_id:ctx.tenantId,...body,active:true}).select().single();if(error)throw error;return NextResponse.json({data},{status:201});
  }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'survey_create_failed'},{status:500});}
}
export async function PUT(req:Request){
  try{const ctx=await requirePermission('contacts.update');const body=responseSchema.parse(await req.json());const supabase=await createClient();const {data,error}=await supabase.from('survey_responses').insert({tenant_id:ctx.tenantId,...body}).select().single();if(error)throw error;return NextResponse.json({data},{status:201});
  }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'survey_response_create_failed'},{status:500});}
}
