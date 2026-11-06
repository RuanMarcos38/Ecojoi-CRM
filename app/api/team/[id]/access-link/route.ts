import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requirePermission} from '@/lib/auth/context';
import {createAdminClient} from '@/lib/supabase/admin';
import {getPublicAppUrl} from '@/lib/supabase/env';
import {sendAccessEmail} from '@/lib/server/access-email';
import {audit} from '@/lib/server/audit';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const ctx=await requirePermission('team.manage');
  const {id}=await params;
  if(!z.string().uuid().safeParse(id).success)return NextResponse.json({error:'not_found'},{status:404});
  const body=z.object({delivery:z.enum(['email','link']).default('email')}).parse(await req.json());
  const admin=createAdminClient();
  const {data:profile,error}=await admin.from('profiles').select('id,full_name,role,active,deleted_at').eq('tenant_id',ctx.tenantId).eq('id',id).maybeSingle();
  if(error)throw error;
  if(!profile)return NextResponse.json({error:'not_found'},{status:404});
  if(!profile.active||profile.deleted_at)return NextResponse.json({error:'inactive_user'},{status:409});
  if(profile.role==='super_admin'&&ctx.role!=='super_admin')return NextResponse.json({error:'forbidden'},{status:403});
  const {data:userData,error:userError}=await admin.auth.admin.getUserById(id);
  if(userError||!userData.user?.email)return NextResponse.json({error:'email_not_found'},{status:404});
  const type=userData.user.email_confirmed_at?'recovery':'invite';
  const {data,error:linkError}=await admin.auth.admin.generateLink({type,email:userData.user.email,options:{redirectTo:`${getPublicAppUrl()}/redefinir-senha?convite=1`}});
  if(linkError||!data.properties?.hashed_token||data.user?.id!==id)return NextResponse.json({error:'access_link_failed'},{status:400});
  const url=new URL('/acessar-convite',getPublicAppUrl());url.searchParams.set('token_hash',data.properties.hashed_token);url.searchParams.set('type',type);
  const emailed=body.delivery==='email'&&await sendAccessEmail(userData.user.email,profile.full_name,url.toString());
  await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'team.access_link',entity:'profile',entityId:id,metadata:{delivery:emailed?'email':'link',type}});
  return NextResponse.json({data:{email:userData.user.email,delivery:emailed?'email':'link',invite_url:emailed?null:url.toString()}},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'access_link_failed'},{status:500});}
}
