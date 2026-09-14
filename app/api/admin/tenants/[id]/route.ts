import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';
const patch=z.object({name:z.string().trim().min(2).max(140).optional(),active:z.boolean().optional()});
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){try{const ctx=await getRequestContext();if(ctx.role!=='super_admin')return NextResponse.json({error:'forbidden'},{status:403});const {id}=await params;const body=patch.parse(await req.json());const supabase=await createClient();const {data,error}=await supabase.from('tenants').update({...body,updated_at:new Date().toISOString()}).eq('id',id).select('id,name,slug,active').maybeSingle();if(error)throw error;if(!data)return NextResponse.json({error:'not_found'},{status:404});await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'platform.tenant.update',entity:'tenant',entityId:id,metadata:{...body,target_tenant:id}});return NextResponse.json({data})}catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});return NextResponse.json({error:'tenant_update_failed'},{status:500})}}
