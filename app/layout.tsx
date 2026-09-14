import './globals.css';
import './polish.css';
import './responsive-enterprise.css';
import './corporate-design.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ecojoi CRM',
  description: 'CRM multiempresa seguro para atendimento, vendas e gestão comercial.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
