import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export function hashApiKey(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function authenticatePublicApi(request: Request, requiredScope?: string) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const raw = match?.[1]?.trim();
  if (!raw?.startsWith('ecojoi_live_')) throw new Response('Unauthorized', { status: 401 });

  const admin = createAdminClient();
  const hash = hashApiKey(raw);
  const { data, error } = await admin
    .from('api_keys')
    .select('id,tenant_id,active,expires_at,scopes,rate_limit_per_minute')
    .eq('key_hash', hash)
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (error || !data) throw new Response('Unauthorized', { status: 401 });
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    throw new Response('Unauthorized', { status: 401 });
  }

  const scopes = Array.isArray(data.scopes) ? data.scopes.map(String) : [];
  if (requiredScope && !scopes.includes('*') && !scopes.includes(requiredScope)) {
    throw new Response('Forbidden', { status: 403 });
  }

  const { data: allowed, error: rateError } = await admin.rpc('consume_api_rate', {
    p_api_key_id: data.id,
    p_limit: Number(data.rate_limit_per_minute ?? 120)
  });
  if (rateError) throw new Response('Rate limit unavailable', { status: 503 });
  if (allowed !== true) throw new Response('Too Many Requests', { status: 429 });

  await admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);

  return {
    keyId: data.id as string,
    tenantId: data.tenant_id as string,
    scopes,
    rateLimitPerMinute: Number(data.rate_limit_per_minute ?? 120)
  };
}
