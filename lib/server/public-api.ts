import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export function hashApiKey(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function authenticatePublicApi(request: Request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const raw = match?.[1]?.trim();
  if (!raw?.startsWith('ecojoi_live_')) throw new Response('Unauthorized', { status: 401 });

  const admin = createAdminClient();
  const hash = hashApiKey(raw);
  const { data, error } = await admin
    .from('api_keys')
    .select('id,tenant_id,active,expires_at')
    .eq('key_hash', hash)
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (error || !data) throw new Response('Unauthorized', { status: 401 });
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    throw new Response('Unauthorized', { status: 401 });
  }

  await admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return { keyId: data.id as string, tenantId: data.tenant_id as string };
}
