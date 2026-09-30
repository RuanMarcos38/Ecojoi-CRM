import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashApiKey } from '@/lib/server/public-api';

const createSchema = z.object({
  name: z.string().trim().min(2).max(80)
});

const deleteSchema = z.object({
  id: z.string().uuid()
});

export async function GET() {
  try {
    const ctx = await requirePermission('settings.manage');
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('api_keys')
      .select('id,name,key_prefix,active,last_used_at,expires_at,created_at')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'api_keys_fetch_failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requirePermission('settings.manage');
    const body = createSchema.parse(await request.json());
    const rawKey = `ecojoi_live_${randomBytes(32).toString('base64url')}`;
    const prefix = rawKey.slice(0, 22);
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('api_keys')
      .insert({
        tenant_id: ctx.tenantId,
        name: body.name,
        key_prefix: prefix,
        key_hash: hashApiKey(rawKey),
        created_by: ctx.userId,
        active: true
      })
      .select('id,name,key_prefix,active,created_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ data: { ...data, api_key: rawKey } }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid_payload', details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: 'api_key_create_failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requirePermission('settings.manage');
    const body = deleteSchema.parse(await request.json());
    const admin = createAdminClient();
    const { error } = await admin
      .from('api_keys')
      .update({ active: false })
      .eq('tenant_id', ctx.tenantId)
      .eq('id', body.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'api_key_revoke_failed' }, { status: 500 });
  }
}
