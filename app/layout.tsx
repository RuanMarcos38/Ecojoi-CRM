import './globals.css';
import './polish.css';
import './responsive-enterprise.css';
import './corporate-design.css';
import './approved-layout.css';
import './sidebar-full-height.css';
import type { Metadata } from 'next';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env';

export const metadata: Metadata = {
  title: 'Ecojoi CRM',
  description: 'CRM multiempresa seguro para atendimento, vendas e gestão comercial.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const runtimeEnv = {
    supabaseUrl: getSupabaseUrl(),
    supabaseAnonKey: getSupabaseAnonKey()
  };
  const runtimeEnvScript = `window.__ECOJOI_PUBLIC_ENV__=${JSON.stringify(runtimeEnv).replace(/</g, '\\u003c')};`;

  return <html lang="pt-BR"><body><script dangerouslySetInnerHTML={{ __html: runtimeEnvScript }} />{children}</body></html>;
}
