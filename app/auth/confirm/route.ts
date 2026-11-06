import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getPublicAppUrl } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

function getSafeNext(path: string | null, origin: string, type: EmailOtpType | null) {
  const fallback = new URL(type === 'invite' ? '/redefinir-senha?convite=1' : '/setup', origin);
  if (!path?.startsWith('/')) return fallback;
  try {
    const target = new URL(path, origin);
    return target.origin === origin ? target : fallback;
  } catch {
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const publicOrigin = getPublicAppUrl(requestUrl.origin);
  const code = requestUrl.searchParams.get('code');
  const flowId = requestUrl.searchParams.get('sb_flow_id');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
  const next = getSafeNext(requestUrl.searchParams.get('next'), publicOrigin, type);
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );

    if (!error) return NextResponse.redirect(next);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) return NextResponse.redirect(next);
  }

  return NextResponse.redirect(new URL('/login?auth_error=confirmacao', publicOrigin));
}
