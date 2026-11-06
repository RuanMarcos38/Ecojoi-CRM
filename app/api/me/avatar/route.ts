import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { hasPermission } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/admin';

const bucket = 'ecojoi-message-attachments';
const limit = 1024 * 1024;
const avatarPath = (tenantId: string, userId: string) => `_profile-avatars/${tenantId}/${userId}`;

function imageType(bytes: Buffer) {
  if (bytes.length < 12) return null;
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export async function GET(request: Request) {
  try {
    const ctx = await getRequestContext();
    const userId = new URL(request.url).searchParams.get('userId') ?? ctx.userId;
    if (!z.string().uuid().safeParse(userId).success) return new Response(null, { status: 404 });
    if (userId !== ctx.userId && !hasPermission(ctx.role, 'conversations.view')) {
      return new Response(null, { status: 403 });
    }

    // Storage paths always use the tenant from the authenticated server context.
    const { data, error } = await createAdminClient().storage.from(bucket).download(avatarPath(ctx.tenantId, userId));
    const type = !error && data && data.size <= limit
      ? imageType(Buffer.from(await data.slice(0, 12).arrayBuffer())) : null;
    if (!data || !type) {
      return new Response(null, { status: 404, headers: { 'cache-control': 'private, no-store' } });
    }
    return new Response(data, { headers: {
      'content-type': type,
      'cache-control': 'private, max-age=60',
      vary: 'Cookie',
      'x-content-type-options': 'nosniff'
    } });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response(null, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getRequestContext();
    if (Number(request.headers.get('content-length')) > limit + 4096) {
      return NextResponse.json({ error: 'A foto deve ter até 1 MB.' }, { status: 413 });
    }
    const form = await request.formData().catch(() => null);
    const file = form?.get('avatar');
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: 'Selecione uma foto.' }, { status: 400 });
    }
    if (file.size > limit) {
      return NextResponse.json({ error: 'A foto deve ter até 1 MB.' }, { status: 413 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = imageType(bytes);
    if (!type || type !== file.type) {
      return NextResponse.json({ error: 'Use uma imagem JPG, PNG ou WebP válida.' }, { status: 415 });
    }
    const { error } = await createAdminClient().storage.from(bucket)
      .upload(avatarPath(ctx.tenantId, ctx.userId), bytes, { upsert: true, contentType: type });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'Não foi possível salvar a foto.' }, { status: 500 });
  }
}
