import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';

const fields = 'state_code,state_registration,tax_regime,municipality_code,postal_code,address_line,integration_method';
const schema = z.object({
  state_code: z.enum(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']),
  state_registration: z.string().regex(/^\d{2,14}$/),
  tax_regime: z.enum(['1', '2', '3', '4']),
  municipality_code: z.string().regex(/^\d{7}$/),
  postal_code: z.string().regex(/^\d{8}$/),
  address_line: z.string().trim().min(3).max(160),
  integration_method: z.enum(['provider', 'direct'])
});

function failure(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: 'Revise os campos do cadastro fiscal.' }, { status: 400 });
  }
  return NextResponse.json({ error: 'Não foi possível acessar a configuração fiscal.' }, { status: 500 });
}

export async function GET() {
  try {
    const { tenantId } = await requirePermission('settings.manage');
    const admin = createAdminClient();
    const [company, fiscal] = await Promise.all([
      admin.from('tenant_settings').select('legal_name,document').eq('tenant_id', tenantId).maybeSingle(),
      admin.from('fiscal_issuer_configuration').select(fields).eq('tenant_id', tenantId).maybeSingle()
    ]);
    if (company.error || fiscal.error) throw company.error ?? fiscal.error;

    const document = String(company.data?.document ?? '').replace(/[^a-z\d]/gi, '');
    return NextResponse.json({
      company: {
        legal_name: company.data?.legal_name ?? null,
        has_company_document: /^[A-Z0-9]{12}\d{2}$/i.test(document)
      },
      fiscal: fiscal.data
    }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { tenantId, userId } = await requirePermission('settings.manage');
    const input = schema.parse(await request.json());
    const { error } = await createAdminClient().from('fiscal_issuer_configuration').upsert({
      ...input, tenant_id: tenantId, updated_by: userId, updated_at: new Date().toISOString()
    }, { onConflict: 'tenant_id' });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
