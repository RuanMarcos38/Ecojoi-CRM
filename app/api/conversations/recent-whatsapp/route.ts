import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { recoverRecentEvolutionReplies } from '@/lib/server/evolution';

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('sec-fetch-site');
    if (origin && origin !== 'same-origin') return new Response(null, { status: 403 });
    const ctx = await requirePermission('conversations.view');
    await requireFeature(ctx, 'atendimento');
    const result = await recoverRecentEvolutionReplies(ctx.tenantId);
    return NextResponse.json({ recovered: result.recovered });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'recent_whatsapp_recovery_failed' }, { status: 503 });
  }
}
