import { NextResponse } from 'next/server';
import { processEvolutionWebhook, verifyEvolutionWebhookToken } from '@/lib/server/evolution';

export async function POST(request: Request) {
  try {
    const supplied = new URL(request.url).searchParams.get('token') || '';
    const payload = await request.json();
    const instanceName = String(payload?.instance || payload?.instanceName || payload?.data?.instance || '');

    if (!instanceName || !(await verifyEvolutionWebhookToken(instanceName, supplied))) {
      return NextResponse.json({ error: 'invalid_webhook_token' }, { status: 401 });
    }

    await processEvolutionWebhook(payload);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'evolution_webhook_failed' }, { status: 500 });
  }
}
