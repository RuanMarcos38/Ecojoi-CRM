import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAnonKey, getSupabaseUrl, hasSupabasePublicEnv } from '../lib/supabase/env';

afterEach(() => vi.unstubAllEnvs());

describe('Supabase runtime configuration', () => {
  it('reads public configuration set after the module was imported', () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://first.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-first');
    expect(getSupabaseUrl()).toBe('https://first.supabase.co');
    expect(getSupabaseAnonKey()).toBe('public-first');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://second.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-second');
    expect(getSupabaseUrl()).toBe('https://second.supabase.co');
    expect(getSupabaseAnonKey()).toBe('public-second');
  });

  it('prefers server aliases and never uses the service role as a public key', () => {
    vi.stubEnv('SUPABASE_URL', ' https://runtime.supabase.co ');
    vi.stubEnv('SUPABASE_ANON_KEY', ' runtime-public ');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://build.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'build-public');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'private-key');
    expect(getSupabaseUrl()).toBe('https://runtime.supabase.co');
    expect(getSupabaseAnonKey()).toBe('runtime-public');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    expect(getSupabaseAnonKey()).toBe('');
    expect(hasSupabasePublicEnv()).toBe(false);
  });
});
