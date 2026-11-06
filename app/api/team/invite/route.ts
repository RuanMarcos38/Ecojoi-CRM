import { sendAccessEmail } from '@/lib/server/access-email';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/server/audit';
import { getPublicAppUrl } from '@/lib/supabase/env';

const schema = z.object({email:z.string().trim().email().transform(v=>v.toLowerCase()),full_name:z.string().trim().min(2).max(140),role:z.enum(['company_admin','manager','user']).default('user'),delivery:z.enum(['email','link']).default('email')});
const reply = (data: unknown, status: number) => NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('team.manage');
    const body=schema.parse(await req.json());
    let admin;try{admin=createAdminClient()}catch{return reply({error:'admin_key_not_configured'},503)}
    // Check existing ownership before creating a new credential or sending an invite.
    // Pagination is deliberately not a limit on the number of staff.
    let existingId: string | null = null;
    for(let page=1;;page++){
      const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});
      if(error) return reply({error:'invite_lookup_failed'},503);
      const existing=data.users.find(u=>u.email?.toLowerCase()===body.email);
      if(existing){
        const {data:profile,error:profileError}=await admin.from('profiles').select('tenant_id').eq('id',existing.id).maybeSingle();
        if(profileError)return reply({error:'invite_lookup_failed'},503);
        if(profile?.tenant_id && profile.tenant_id!==ctx.tenantId)return reply({error:'email_unavailable'},409);
        if(existing.email_confirmed_at)return reply({error:'user_already_registered'},409);
        existingId=existing.id;
        break;
      }
      if(data.users.length<1000)break;
    }
    const redirectTo=`${getPublicAppUrl()}/redefinir-senha?convite=1`;
    let userId: string | null = null;
    let inviteUrl: string | null = null;
    let delivery: 'email'|'link' = body.delivery;
    let mailError: string | null = null;
    if(delivery==='email'){
      const {data,error}=await admin.auth.admin.inviteUserByEmail(body.email,{data:{full_name:body.full_name},redirectTo});
      if(!error && data.user)userId=data.user.id;
      else {
        mailError=error?.code??'email_delivery_failed';
        // Do not mistake account/database errors for an email quota failure.
        if(!['over_email_send_rate_limit','email_address_not_authorized'].includes(mailError) && !/smtp|email.*(rate|send)|sending.*email/i.test(error?.message??'')){
          return reply({error:'invite_failed',reason:mailError},400);
        }
        delivery='link';
      }
    }
    if(delivery==='link'){
      const {data,error}=await admin.auth.admin.generateLink({type:'invite',email:body.email,options:{data:{full_name:body.full_name},redirectTo}});
      if(error||!data.user||!data.properties?.hashed_token)return reply({error:'invite_link_failed'},400);
      userId=data.user.id;
      const url=new URL('/acessar-convite',getPublicAppUrl());
      url.searchParams.set('token_hash',data.properties.hashed_token);
      url.searchParams.set('type','invite');
      url.searchParams.set('next','/redefinir-senha?convite=1');
      inviteUrl=url.toString();
    }
    if(!userId)return reply({error:'invite_failed'},400);
    const {data:profile,error:lookupError}=await admin.from('profiles').select('tenant_id').eq('id',userId).maybeSingle();
    if(lookupError)return reply({error:'profile_create_failed'},500);
    if(profile && profile.tenant_id!==ctx.tenantId)return reply({error:'email_unavailable'},409);
    if(!profile){
      const {error}=await admin.from('profiles').insert({id:userId,tenant_id:ctx.tenantId,full_name:body.full_name,role:body.role,active:true});
      // Retain the Auth identity on failure so a retry can repair its missing profile.
      if(error)return reply({error:'profile_create_failed'},500);
    }
    if(delivery==='link' && inviteUrl && body.delivery==='email' && await sendAccessEmail(body.email,body.full_name,inviteUrl)){delivery='email';inviteUrl=null;}
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'team.invite',entity:'profile',entityId:userId,metadata:{role:body.role,delivery,reissued:!!existingId}});
    return reply({data:{id:userId,email:body.email,full_name:body.full_name,role:body.role,delivery,invite_url:inviteUrl,email_error:mailError}},201);
  }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return reply({error:'invalid_payload'},400);return reply({error:'team_invite_failed'},500)}
}
