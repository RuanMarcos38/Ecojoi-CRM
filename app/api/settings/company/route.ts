import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';
import { metaRuntimeConfigured } from '@/lib/server/meta';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalId = (max = 120) => z.union([z.string().trim().max(max), z.literal(''), z.null()])
  .optional()
  .transform(value => value === '' ? null : value);

const patch = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  legal_name: optionalText(180),
  document: optionalText(40),
  phone: optionalText(40),
  email: z.string().email().nullable().optional(),
  timezone: z.string().trim().min(2).max(80).optional(),
  locale: z.string().trim().min(2).max(20).optional(),
  meta_pixel_id: z.union([z.string().trim().regex(/^\d{5,30}$/), z.literal(''), z.null()])
    .optional().transform(value => value === '' ? null : value),
  google_analytics_id: z.union([z.string().trim().regex(/^(G-[A-Z0-9]+|UA-\d+-\d+)$/i), z.literal(''), z.null()])
    .optional().transform(value => value === '' ? null : value),
  auto_assign_leads: z.boolean().optional(),
  meta_business_id: optionalId(),
  meta_waba_id: optionalId(),
  meta_phone_number_id: optionalId(),
  meta_page_id: optionalId(),
  meta_instagram_account_id: optionalId(),
  whatsapp_provider: z.enum(['meta','evolution']).optional(),
  evolution_instance_name: z.union([z.string().trim().regex(/^[a-zA-Z0-9 ._-]{2,80}$/), z.literal(''), z.null()])
    .optional().transform(value => value === '' ? null : value),
  attachment_retention_days: z.coerce.number().int().min(30).max(3650).optional()
});

export async function GET() {
  try {
    const ctx = await requirePermission('settings.view');
    const supabase = await createClient();
    const [{ data: tenant, error: tenantError }, { data: settings, error: settingsError }] = await Promise.all([
      supabase.from('tenants').select('id,name,slug,active').eq('id', ctx.tenantId).single(),
      supabase.from('tenant_settings')
        .select('legal_name,document,phone,email,timezone,locale,meta_pixel_id,google_analytics_id,auto_assign_leads,meta_business_id,meta_waba_id,meta_phone_number_id,meta_page_id,meta_instagram_account_id,whatsapp_provider,evolution_instance_name,attachment_retention_days')
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle()
    ]);

    if (tenantError || settingsError) throw tenantError ?? settingsError;
    const metaIdsReady = Boolean(
      settings?.meta_phone_number_id || settings?.meta_page_id || settings?.meta_instagram_account_id
    );

    return NextResponse.json({
      data: {
        ...tenant,
        ...(settings ?? {}),
        meta_connector_ready: metaRuntimeConfigured() && metaIdsReady
      }
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'company_settings_fetch_failed' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requirePermission('settings.manage');
    const body = patch.parse(await req.json());
    const supabase = await createClient();
    const { name, ...settings } = body;

    if (name) {
      const { error } = await supabase
        .from('tenants')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', ctx.tenantId);
      if (error) throw error;
    }

    if (Object.keys(settings).length) {
      const { error } = await supabase
        .from('tenant_settings')
        .upsert(
          { tenant_id: ctx.tenantId, ...settings, updated_at: new Date().toISOString() },
          { onConflict: 'tenant_id' }
        );
      if (error) throw error;
    }

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'settings.update',
      entity: 'tenant',
      entityId: ctx.tenantId,
      metadata: { fields: Object.keys(body) }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid_payload', details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: 'company_settings_update_failed' }, { status: 500 });
  }
}
