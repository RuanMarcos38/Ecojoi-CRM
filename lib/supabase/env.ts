const PRODUCTION_APP_URL = 'https://crm.ecojoi.com.br';

function runtimeEnv(name: string) {
  // Dynamic lookup keeps NEXT_PUBLIC values from being frozen by the build.
  return process.env[name]?.trim() || '';
}

function normalizeAppUrl(value: string) {
  if (!value) return '';
  try {
    const url = new URL(value.includes('://') ? value : 'https://' + value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    const host = url.hostname.toLowerCase();
    const internalHost = host === '0.0.0.0' || host === '127.0.0.1' || host === 'localhost' || host === '::1';
    if (internalHost && process.env.NODE_ENV === 'production') return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function getSupabaseUrl() {
  return runtimeEnv('SUPABASE_URL') || runtimeEnv('NEXT_PUBLIC_SUPABASE_URL');
}

export function getSupabaseAnonKey() {
  return runtimeEnv('SUPABASE_ANON_KEY') || runtimeEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export function getPublicAppUrl(fallback = '') {
  return normalizeAppUrl(runtimeEnv('APP_URL') || runtimeEnv('NEXT_PUBLIC_APP_URL'))
    || normalizeAppUrl(fallback)
    || PRODUCTION_APP_URL;
}

export function hasSupabasePublicEnv() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}
