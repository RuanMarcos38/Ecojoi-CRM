import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePublicApi } from '@/lib/server/public-api';
import { ingestLead } from '@/lib/server/lead-ingestion';
import { createAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
  name: z.string().trim().min(2).max(140),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  source: z.string().trim().max(80).optional().nullable(),
  channel: z.enum(['internal','whatsapp','instagram','facebook','email','external']).optional().default('external'),
  external_id: z.string().trim().max(240).optional().nullable(),
  message: z.string().trim().max(4000).optional().nullable(),
  attribution: z.record(z.unknown()).optional().default({})
});

export async function GET(request: Request) {
  try {
    const auth = await authenticatePublicApi(request, 'leads:read');
    const admin = createAdminClient();
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get('limit') ?? 50);
    const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? Math.round(limitRaw) : 50));

    const { data, error } = await admin
      .from('contacts')
      .select('id,name,email,phone,source,status,owner_id,attribution,created_at,updated_at')
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'public_leads_fetch_failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticatePublicApi(request, 'leads:write');
    const body = schema.parse(await request.json());
    const result = await ingestLead({
      tenantId: auth.tenantId,
      name: body.name,
      email: body.email,
      phone: body.phone,
      source: body.source || 'API',
      channel: body.channel,
      externalId: body.external_id,
      externalName: body.name,
      message: body.message,
      attribution: body.attribution,
      createConversation: Boolean(body.message || body.channel !== 'internal')
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid_payload', details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: 'public_lead_create_failed' }, { status: 500 });
  }
}
