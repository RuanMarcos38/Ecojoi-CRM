import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { getWhatsAppStatus } from '@/lib/server/whatsapp';

export async function GET() {
  try {
    const ctx = await requirePermission('settings.view');
    return NextResponse.json({ data: await getWhatsAppStatus(ctx.tenantId) });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'whatsapp_status_failed' }, { status: 500 });
  }
}
