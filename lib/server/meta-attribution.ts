/**
 * WhatsApp Cloud API referral data is only supplied on qualifying inbound
 * messages (for example, Click-to-WhatsApp ads). Persist a minimal allowlist
 * for lead attribution; never persist full ad creative or arbitrary payloads.
 */
export function metaWhatsAppAttribution(phoneNumberId: string, referral: unknown) {
  const base: Record<string, string> = { meta_phone_number_id: phoneNumberId };
  if (!referral || typeof referral !== 'object' || Array.isArray(referral)) {
    return { source: 'WhatsApp', attribution: base };
  }
  const data = referral as Record<string, unknown>;
  const kind = data.source_type === 'ad' ? 'ad' : data.source_type === 'post' ? 'post' : null;
  if (!kind) return { source: 'WhatsApp', attribution: base };

  base.meta_referral_type = kind;
  const allowed: Record<string, [string, number]> = {
    source_id: ['meta_ad_source_id', 80],
    ctwa_clid: ['meta_ctwa_clid', 512],
    source_url: ['meta_referral_url', 1024]
  };
  for (const [key, [target, max]] of Object.entries(allowed)) {
    const value = data[key];
    if (typeof value === 'string' && value.length > 0 && value.length <= max) base[target] = value;
  }
  return {
    source: kind === 'ad' ? 'Meta Click-to-WhatsApp Ads' : 'Meta WhatsApp Post',
    attribution: base
  };
}
