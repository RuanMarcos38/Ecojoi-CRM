function runtimeEnv(name: string) {
  // Dynamic lookup keeps NEXT_PUBLIC values from being frozen by the build.
  return process.env[name]?.trim() || '';
}

export function getSupabaseUrl() {
  return runtimeEnv('SUPABASE_URL') || runtimeEnv('NEXT_PUBLIC_SUPABASE_URL');
}

export function getSupabaseAnonKey() {
  return runtimeEnv('SUPABASE_ANON_KEY') || runtimeEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export function hasSupabasePublicEnv() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}
