import './globals.css';
import './polish.css';
import './responsive-enterprise.css';
import './corporate-design.css';
import './approved-layout.css';
import './sidebar-full-height.css';
import './crm-enterprise-refinement.css';
import './reference-theme.css';
import './professional-ui.css';
import './enterprise-2026.css';
import type { Metadata } from 'next';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env';
import { PwaRegister } from '@/components/PwaRegister';
import { connection } from 'next/server';

export const metadata: Metadata = {
  title: 'CRM Corporativo',
  description: 'Plataforma de gestão comercial multiempresa, atendimento e relacionamento.'
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // cPanel supplies configuration at startup, after the standalone build.
  await connection();
  const runtimeEnv = {
    supabaseUrl: getSupabaseUrl(),
    supabaseAnonKey: getSupabaseAnonKey()
  };
  const runtimeEnvScript = `window.__ECOJOI_PUBLIC_ENV__=${JSON.stringify(runtimeEnv).replace(/</g, '\\u003c')};`;

  return <html lang="pt-BR"><body><script dangerouslySetInnerHTML={{ __html: runtimeEnvScript }} /><PwaRegister/>{children}</body></html>;
}
