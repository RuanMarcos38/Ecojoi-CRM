/**
 * WhatsApp Cloud API referral data is only supplied on qualifying inbound
 * messages (for example, Click-to-WhatsApp ads). Persist a minimal allowlist
 * for lead attribution; never persist full ad creative or arbitrary payloads.
 */
export function metaAdPreview(messageId: unknown, headline: unknown, image: unknown, thumbnail: unknown, jpeg?: unknown) {
  if (typeof messageId !== 'string' || !messageId || messageId.length > 512) return {};
  let imageUrl: string | null = null;
  for (const candidate of [image, thumbnail]) {
    if (typeof candidate !== 'string' || candidate.length > 4096) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' && !url.username && !url.password) {
        imageUrl = url.href;
        break;
      }
    } catch {
      continue;
    }
  }
  const bytes = typeof jpeg === 'string' && jpeg.length <= 32768 && /^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(jpeg)
    ? `data:image/jpeg;base64,${jpeg}` : null;
  return {
    meta_ad_preview: {
      messageId,
      headline: typeof headline === 'string' ? headline.trim().slice(0, 180) : '',
      image: bytes ?? imageUrl
    }
  };
}

export function metaWhatsAppAttribution(phoneNumberId: string, referral: unknown, messageId?: string) {
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
    attribution: kind === 'ad'
      ? { ...base, ...metaAdPreview(messageId, data.headline, data.image_url, data.thumbnail_url) }
      : base
  };
}
