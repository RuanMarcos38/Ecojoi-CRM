import {
  isWhatsAppWindowOpen as metaWindowOpen,
  sendWhatsAppMedia as sendMetaMedia,
  sendWhatsAppTemplate as sendMetaTemplate,
  sendWhatsAppText as sendMetaText,
  getTenantMetaStatus
} from '@/lib/server/meta';
import {
  getTenantEvolutionStatus,
  sendEvolutionMedia,
  sendEvolutionText
} from '@/lib/server/evolution';
import { createAdminClient } from '@/lib/supabase/admin';

export type WhatsAppProvider = 'meta' | 'evolution';

export async function getWhatsAppProvider(tenantId: string): Promise<WhatsAppProvider> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenant_settings')
    .select('whatsapp_provider')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  return data?.whatsapp_provider === 'evolution' ? 'evolution' : 'meta';
}

export async function getWhatsAppStatus(tenantId: string) {
  const provider = await getWhatsAppProvider(tenantId);

  if (provider === 'evolution') {
    const evolution = await getTenantEvolutionStatus(tenantId);
    return { provider, ok: evolution.ok, evolution };
  }

  const meta = await getTenantMetaStatus(tenantId);
  return {
    provider,
    ok: meta.runtimeConfigured && meta.identifiersConfigured,
    meta
  };
}

export async function canSendFreeformWhatsApp(tenantId: string, lastInboundAt?: string | null) {
  const provider = await getWhatsAppProvider(tenantId);
  return provider === 'evolution' ? true : metaWindowOpen(lastInboundAt);
}

export async function sendWhatsAppText(tenantId: string, to: string | null | undefined, body: string) {
  const provider = await getWhatsAppProvider(tenantId);
  return provider === 'evolution'
    ? sendEvolutionText(tenantId, to, body)
    : sendMetaText(tenantId, to, body);
}

export async function sendWhatsAppMedia(
  tenantId: string,
  to: string | null | undefined,
  file: File,
  caption?: string | null
) {
  const provider = await getWhatsAppProvider(tenantId);
  return provider === 'evolution'
    ? sendEvolutionMedia(tenantId, to, file, caption)
    : sendMetaMedia(tenantId, to, file, caption);
}

export async function sendWhatsAppTemplate(
  tenantId: string,
  to: string | null | undefined,
  name: string,
  language = 'pt_BR',
  components: unknown[] = []
) {
  const provider = await getWhatsAppProvider(tenantId);
  if (provider === 'evolution') {
    return { delivered: false as const, reason: 'templates_not_supported_by_evolution' };
  }
  return sendMetaTemplate(tenantId, to, name, language, components);
}
