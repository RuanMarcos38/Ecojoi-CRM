import { NextResponse } from 'next/server';
import { processEvolutionWebhook } from '@/lib/server/evolution';

function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request) {
  const expected = process.env.EVOLUTION_WEBHOOK_TOKEN?.trim() || '';
  const supplied = new URL(request.url).searchParams.get('token') || '';

  if (!safeEqual(expected, supplied)) {
    return NextResponse.json({ error: 'invalid_webhook_token' }, { status: 401 });
  }

  try {
    const payload = await request.json();
    await processEvolutionWebhook(payload);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'evolution_webhook_failed' }, { status: 500 });
  }
}
