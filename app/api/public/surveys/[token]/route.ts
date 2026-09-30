import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function resolve(token:string){
  const admin=createAdminClient();
  const {data}=await admin.from('customer_survey_invitations')
    .select('id,tenant_id,survey_id,contact_id,token,expires_at,responded_at,survey:customer_surveys(id,name,survey_type,question,active)')
    .eq('token',token).maybeSingle();
  return data??null;
}

export async function GET(_:Request,{params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  const invite=await resolve(token);
  const survey=Array.isArray(invite?.survey)?invite?.survey[0]:invite?.survey;
  if(!invite||!survey?.active)return NextResponse.json({error:'survey_not_found'},{status:404});
  if(invite.responded_at)return NextResponse.json({error:'survey_already_answered'},{status:409});
  if(invite.expires_at&&new Date(invite.expires_at).getTime()<Date.now())return NextResponse.json({error:'survey_expired'},{status:410});
  return NextResponse.json({data:{name:survey.name,type:survey.survey_type,question:survey.question}});
}

export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){
  try{
    const {token}=await params;
    const invite=await resolve(token);
    const survey=Array.isArray(invite?.survey)?invite?.survey[0]:invite?.survey;
    if(!invite||!survey?.active)return NextResponse.json({error:'survey_not_found'},{status:404});
    if(invite.responded_at)return NextResponse.json({error:'survey_already_answered'},{status:409});
    if(invite.expires_at&&new Date(invite.expires_at).getTime()<Date.now())return NextResponse.json({error:'survey_expired'},{status:410});
    const input=await req.json();
    const score=Number(input?.score);
    if(!Number.isInteger(score)||score<0||score>10)return NextResponse.json({error:'invalid_score'},{status:400});
    const admin=createAdminClient();
    const {data,error}=await admin.from('customer_survey_responses').insert({
      tenant_id:invite.tenant_id,survey_id:invite.survey_id,contact_id:invite.contact_id,
      score,comment:String(input?.comment??'').trim()||null
    }).select('id,score,submitted_at').single();
    if(error)throw error;
    await admin.from('customer_survey_invitations').update({responded_at:new Date().toISOString()}).eq('id',invite.id);
    return NextResponse.json({data},{status:201});
  }catch{
    return NextResponse.json({error:'survey_submit_failed'},{status:500});
  }
}
