import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { getN8nStatus } from '@/lib/server/n8n';

export async function GET() {
  try {
    const ctx = await requirePermission('automations.view');
    const data = await getN8nStatus(ctx.tenantId);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'n8n_status_failed' }, { status: 500 });
  }
}
