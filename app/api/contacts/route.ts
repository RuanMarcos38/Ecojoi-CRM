import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { audit } from '@/lib/server/audit';

const attributionSchema = z.object({
  utm_source: z.string().trim().max(120).optional().nullable(),
  utm_medium: z.string().trim().max(120).optional().nullable(),
  utm_campaign: z.string().trim().max(180).optional().nullable(),
  utm_content: z.string().trim().max(180).optional().nullable(),
  utm_term: z.string().trim().max(180).optional().nullable(),
  landing_page: z.string().trim().max(2000).optional().nullable(),
  referrer: z.string().trim().max(2000).optional().nullable(),
  gclid: z.string().trim().max(500).optional().nullable(),
  fbclid: z.string().trim().max(500).optional().nullable()
}).partial();

const schema = z.object({
  name: z.string().min(2).max(140),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  source: z.string().max(80).optional().nullable(),
  status: z.enum(['lead', 'active', 'inactive']).default('lead'),
  attribution: attributionSchema.optional().nullable()
});

type Attribution = z.infer<typeof attributionSchema>;

function normalizeAttribution(input?: Attribution | null) {
  if (!input) return {};
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
      .filter(([, value]) => Boolean(value))
  );
}

function inferSource(source: string | null | undefined, attribution: Record<string, unknown>) {
  const explicit = source?.trim();
  if (explicit) return explicit.slice(0, 80);

  const utmSource = typeof attribution.utm_source === 'string' ? attribution.utm_source.trim() : '';
  if (utmSource) return utmSource.slice(0, 80);
  if (attribution.gclid) return 'Google Ads';
  if (attribution.fbclid) return 'Meta Ads';

  const referrer = typeof attribution.referrer === 'string' ? attribution.referrer : '';
  if (referrer) {
    try {
      return new URL(referrer).hostname.replace(/^www\./, '').slice(0, 80);
    } catch {
      return referrer.slice(0, 80);
    }
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const ctx = await requirePermission('contacts.view');
    const supabase = await createClient();
    const status = new URL(request.url).searchParams.get('status');

    let query = supabase
      .from('contacts')
      .select('id,name,email,phone,source,status,attribution,created_at')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false });

    if (status && ['lead', 'active', 'inactive'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'contacts_fetch_failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('contacts.create');
    const body = schema.parse(await req.json());
    const supabase = await createClient();
    const attribution = normalizeAttribution(body.attribution);

    const { data, error } = await supabase
      .from('contacts')
      .insert({
        ...body,
        source: inferSource(body.source, attribution),
        attribution,
        tenant_id: ctx.tenantId,
        created_by: ctx.userId
      })
      .select()
      .single();

    if (error) throw error;

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'contact.create',
      entity: 'contact',
      entityId: data.id,
      metadata: {
        source: data.source ?? null,
        has_attribution: Object.keys(attribution).length > 0
      }
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid_payload', details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: 'contact_create_failed' }, { status: 500 });
  }
}
