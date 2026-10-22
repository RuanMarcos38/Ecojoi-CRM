import { NextResponse } from 'next/server';
import { hasSupabasePublicEnv } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

// Read-only operational probe: never expose environment variable values or credentials.
export async function GET() {
  const configured = hasSupabasePublicEnv();
  return NextResponse.json({
    status: configured ? 'ready' : 'configuration_required',
    authenticationConfigured: configured
  }, {
    status: configured ? 200 : 503,
    headers: { 'cache-control': 'no-store, max-age=0' }
  });
}
