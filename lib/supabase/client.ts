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
  const url = runtimeEnv?.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = runtimeEnv?.supabaseAnonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Supabase environment variables are missing.');
  return createBrowserClient(url, anon);
}
