'use client';
import { createBrowserClient } from '@supabase/ssr';

const PRODUCTION_APP_URL = 'https://crm.ecojoi.com.br';

declare global {
  interface Window {
    __ECOJOI_PUBLIC_ENV__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
      appUrl?: string;
    };
  }
}

function isInternalOrigin(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === '0.0.0.0' || host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return true;
  }
}

export function getPublicAppUrl() {
  const runtimeEnv = typeof window !== 'undefined' ? window.__ECOJOI_PUBLIC_ENV__ : undefined;
  const configured = runtimeEnv?.appUrl?.trim();
  if (configured && !isInternalOrigin(configured)) return configured.replace(/\/$/, '');

  if (typeof window !== 'undefined') {
    const currentOrigin = window.location.origin;
    if (!isInternalOrigin(currentOrigin)) return currentOrigin;
  }

  return PRODUCTION_APP_URL;
}

export function createClient() {
  const runtimeEnv = typeof window !== 'undefined' ? window.__ECOJOI_PUBLIC_ENV__ : undefined;
  const url = runtimeEnv?.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = runtimeEnv?.supabaseAnonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Supabase environment variables are missing.');
  return createBrowserClient(url, anon);
}
