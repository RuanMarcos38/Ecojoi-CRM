import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { audit } from '@/lib/server/audit';
const patch=z.object({role:z.enum(['company_admin','manager','user']).optional(),active:z.boolean().optional()});
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){try{const ctx=await requirePermission('team.manage');const {id}=await params;const body=patch.parse(await req.json());if(id===ctx.userId&&body.active===false)return NextResponse.json({error:'cannot_disable_self'},{status:400});const supabase=await createClient();const {data,error}=await supabase.from('profiles').update({...body,updated_at:new Date().toISOString()}).eq('id',id).eq('tenant_id',ctx.tenantId).select('id,full_name,role,active').maybeSingle();if(error)throw error;if(!data)return NextResponse.json({error:'not_found'},{status:404});await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'team.update',entity:'profile',entityId:id,metadata:body});return NextResponse.json({data})}catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'team_update_failed'},{status:500})}}
