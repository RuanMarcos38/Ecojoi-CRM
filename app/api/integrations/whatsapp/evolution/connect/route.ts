import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { connectEvolution } from '@/lib/server/evolution';
import { getWhatsAppProvider } from '@/lib/server/whatsapp';
import { audit } from '@/lib/server/audit';

export async function POST(request: Request) {
  try {
    const ctx = await requirePermission('settings.manage');
    const provider = await getWhatsAppProvider(ctx.tenantId);
    if (provider !== 'evolution') {
      return NextResponse.json({ error: 'evolution_provider_not_selected' }, { status: 409 });
    }

    const result = await connectEvolution(ctx.tenantId, new URL(request.url).origin);

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'whatsapp.evolution.connect',
      entity: 'tenant',
      entityId: ctx.tenantId,
      metadata: { instance: result.instanceName, state: result.state }
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({
      error: 'evolution_connect_failed',
      detail: error instanceof Error ? error.message : 'unknown_error'
    }, { status: 500 });
  }
}
