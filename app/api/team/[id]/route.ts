import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getRequestContext} from '@/lib/auth/context';
import {createAdminClient} from '@/lib/supabase/admin';
import {audit} from '@/lib/server/audit';
const rename=z.object({full_name:z.string().trim().min(2).max(140)}).strict();
const patch=z.object({role:z.enum(['company_admin','manager','user']).optional(),active:z.boolean().optional(),restore:z.literal(true).optional(),availability_state:z.enum(['online','busy','break','offline']).optional(),receives_automatic_leads:z.boolean().optional(),max_open_conversations:z.coerce.number().int().min(1).max(500).optional()}).strict();
async function mutate(req:Request,params:Promise<{id:string}>,remove:boolean){
 try{
  const ctx=await getRequestContext();const {id}=await params;
  if(!z.string().uuid().safeParse(id).success)return NextResponse.json({error:'not_found'},{status:404});
  const raw=remove?{}:await req.json();
  const master=ctx.role==='company_admin'||ctx.role==='super_admin';
  if (!remove && raw && typeof raw === 'object' && 'full_name' in raw) {
    if (!master) return NextResponse.json({error:'forbidden'},{status:403});
    const {full_name}=rename.parse(raw);
    let query=createAdminClient().from('profiles').update({full_name})
      .eq('id',id).eq('tenant_id',ctx.tenantId).is('deleted_at',null);
    if(ctx.role!=='super_admin')query=query.neq('role','super_admin');
    const {data,error}=await query.select('id').maybeSingle();
    if(error)throw error;
    if(!data)return NextResponse.json({error:'not_found'},{status:404});
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'team.rename',entity:'profile',entityId:id});
    return NextResponse.json({ok:true});
  }
  const body=patch.parse(raw);
  if(!master && !(ctx.role==='manager'&&!remove&&Object.keys(body).length===1&&body.active===false))return NextResponse.json({error:'forbidden'},{status:403});
  const {data,error}=await createAdminClient().rpc('manage_team_member_access',{p_actor:ctx.userId,p_target:id,p_patch:body,p_delete:remove});
  if(error)throw error;
  if(data?.error)return NextResponse.json({error:data.error},{status:data.error==='not_found'?404:data.error==='forbidden'?403:409});
  await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:remove?'team.delete_access':body.restore?'team.restore': 'team.update',entity:'profile',entityId:id,metadata:body});
  return NextResponse.json(data);
 }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'team_update_failed'},{status:500});}
}
export const PATCH=(req:Request,{params}:{params:Promise<{id:string}>})=>mutate(req,params,false);
export const DELETE=(req:Request,{params}:{params:Promise<{id:string}>})=>mutate(req,params,true);
