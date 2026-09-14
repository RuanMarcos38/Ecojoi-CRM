import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/server/audit';
const schema=z.object({email:z.string().email(),full_name:z.string().trim().min(2).max(140),role:z.enum(['company_admin','manager','user']).default('user')});
export async function POST(req:Request){
  try{
    const ctx=await requirePermission('team.manage');const body=schema.parse(await req.json());
    let admin;try{admin=createAdminClient()}catch{return NextResponse.json({error:'admin_key_not_configured'},{status:503})}
    const {data:invite,error:inviteError}=await admin.auth.admin.inviteUserByEmail(body.email,{data:{full_name:body.full_name}});
    if(inviteError||!invite.user) return NextResponse.json({error:'invite_failed',message:inviteError?.message},{status:400});
    const {error:profileError}=await admin.from('profiles').insert({id:invite.user.id,tenant_id:ctx.tenantId,full_name:body.full_name,role:body.role,active:true});
    if(profileError){await admin.auth.admin.deleteUser(invite.user.id);return NextResponse.json({error:'profile_create_failed'},{status:400})}
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'team.invite',entity:'profile',entityId:invite.user.id,metadata:{role:body.role}});
    return NextResponse.json({data:{id:invite.user.id,email:body.email,full_name:body.full_name,role:body.role}},{status:201});
  }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});return NextResponse.json({error:'team_invite_failed'},{status:500})}
}
