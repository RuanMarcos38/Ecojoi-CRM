import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/server/audit';

const schema=z.object({
  provider:z.enum(['google','microsoft','other']),
  account_email:z.string().email().optional().nullable(),
  display_name:z.string().trim().max(160).optional().nullable(),
  sync_email:z.boolean().default(false),
  sync_calendar:z.boolean().default(false),
  scopes:z.array(z.string().max(160)).max(50).default([]),
  metadata:z.record(z.unknown()).default({})
});

export async function GET(){
  try{
    const ctx=await requirePermission('settings.view');
    const admin=createAdminClient();
    const {data,error}=await admin.from('external_connections')
      .select('id,provider,account_email,display_name,scopes,status,sync_email,sync_calendar,last_mail_sync_at,last_calendar_sync_at,last_error,metadata,created_at,updated_at')
      .eq('tenant_id',ctx.tenantId)
      .order('created_at',{ascending:false});
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'external_connections_fetch_failed'},{status:500});
  }
}

export async function POST(request:Request){
  try{
    const ctx=await requirePermission('settings.manage');
    const input=schema.parse(await request.json());
    const admin=createAdminClient();
    const {data,error}=await admin.from('external_connections').insert({
      tenant_id:ctx.tenantId,
      provider:input.provider,
      account_email:input.account_email??null,
      display_name:input.display_name??null,
      scopes:input.scopes,
      status:'active',
      sync_email:input.sync_email,
      sync_calendar:input.sync_calendar,
      metadata:input.metadata,
      created_by:ctx.userId
    }).select('id,provider,account_email,display_name,status,sync_email,sync_calendar,created_at').single();
    if(error)throw error;

    await audit({
      tenantId:ctx.tenantId,userId:ctx.userId,action:'external_connection.create',
      entity:'external_connection',entityId:data.id,
      metadata:{provider:input.provider,sync_email:input.sync_email,sync_calendar:input.sync_calendar}
    });
    return NextResponse.json({data},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'external_connection_create_failed'},{status:500});
  }
}

export async function DELETE(request:Request){
  try{
    const ctx=await requirePermission('settings.manage');
    const body=z.object({id:z.string().uuid()}).parse(await request.json());
    const admin=createAdminClient();
    const {error}=await admin.from('external_connections')
      .update({status:'revoked',sync_email:false,sync_calendar:false,updated_at:new Date().toISOString()})
      .eq('tenant_id',ctx.tenantId).eq('id',body.id);
    if(error)throw error;
    return NextResponse.json({ok:true});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload'},{status:400});
    return NextResponse.json({error:'external_connection_revoke_failed'},{status:500});
  }
}
