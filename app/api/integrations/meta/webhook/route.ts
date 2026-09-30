import { NextResponse } from 'next/server';
import { processMetaWebhook, verifyMetaSignature } from '@/lib/server/meta';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();

  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
  }

  return NextResponse.json({ error: 'meta_webhook_verification_failed' }, { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'invalid_meta_signature' }, { status: 401 });
  }

  try {
    const payload = JSON.parse(raw);
    await processMetaWebhook(payload);
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: 'meta_webhook_processing_failed' }, { status: 500 });
  }
}
