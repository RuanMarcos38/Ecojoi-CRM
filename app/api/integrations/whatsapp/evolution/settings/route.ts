import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/server/audit';

const schema = z.object({
  api_url: z.string().trim().url().max(500),
  api_key: z.string().trim().min(12).max(512).optional()
});

export async function GET() {
  try {
    const ctx = await requirePermission('settings.view');
    const admin = createAdminClient();
    const { data } = await admin
      .from('integration_secrets')
      .select('config,updated_at')
      .eq('tenant_id', ctx.tenantId)
      .eq('provider', 'evolution')
      .maybeSingle();

    const config = (data?.config ?? {}) as Record<string, unknown>;
    const databaseUrl = String(config.api_url ?? '').trim();
    const envUrl = process.env.EVOLUTION_API_URL?.trim() || '';

    return NextResponse.json({
      data: {
        api_url: databaseUrl || envUrl,
        api_key_configured: Boolean(String(config.api_key ?? '').trim() || process.env.EVOLUTION_API_KEY?.trim()),
        source: databaseUrl || String(config.api_key ?? '').trim() ? 'database' : (envUrl ? 'environment' : 'none'),
        updated_at: data?.updated_at ?? null
      }
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'evolution_settings_fetch_failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requirePermission('settings.manage');
    const input = schema.parse(await request.json());
    const admin = createAdminClient();

    const { data: current, error: currentError } = await admin
      .from('integration_secrets')
      .select('config')
      .eq('tenant_id', ctx.tenantId)
      .eq('provider', 'evolution')
      .maybeSingle();
    if (currentError) throw currentError;

    const previous = (current?.config ?? {}) as Record<string, unknown>;
    const previousKey = String(previous.api_key ?? '').trim();
    const envKey = process.env.EVOLUTION_API_KEY?.trim() || '';
    const apiKey = input.api_key?.trim() || previousKey || envKey;

    if (!apiKey) {
      return NextResponse.json({ error: 'evolution_api_key_required' }, { status: 400 });
    }

    const webhookToken = String(previous.webhook_token ?? '').trim()
      || process.env.EVOLUTION_WEBHOOK_TOKEN?.trim()
      || randomBytes(36).toString('base64url');

    const { error } = await admin
      .from('integration_secrets')
      .upsert({
        tenant_id: ctx.tenantId,
        provider: 'evolution',
        config: {
          api_url: input.api_url.replace(/\/$/, ''),
          api_key: apiKey,
          webhook_token: webhookToken
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,provider' });
    if (error) throw error;

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'whatsapp.evolution.settings_update',
      entity: 'tenant',
      entityId: ctx.tenantId,
      metadata: { api_url_changed: input.api_url !== String(previous.api_url ?? ''), api_key_changed: Boolean(input.api_key) }
    });

    return NextResponse.json({ ok: true, data: { api_url: input.api_url.replace(/\/$/, ''), api_key_configured: true } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid_payload', details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: 'evolution_settings_update_failed' }, { status: 500 });
  }
}
