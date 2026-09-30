'use client';
import { createBrowserClient } from '@supabase/ssr';

declare global {
  interface Window {
    __ECOJOI_PUBLIC_ENV__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
    };
  }
}

export function createClient() {
  const runtimeEnv = typeof window !== 'undefined' ? window.__ECOJOI_PUBLIC_ENV__ : undefined;
  const url = runtimeEnv?.supabaseUrl || (typeof process !== 'undefined' ? process.env['NEXT_PUBLIC_SUPABASE_URL'] : undefined);
  const anon = runtimeEnv?.supabaseAnonKey || (typeof process !== 'undefined' ? process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] : undefined);
  if (!url || !anon) throw new Error('Supabase environment variables are missing.');
  return createBrowserClient(url, anon);
}
