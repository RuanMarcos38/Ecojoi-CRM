'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Permission } from '@/lib/auth/permissions';

type Flag = { feature_name: string; enabled: boolean };
type Me = { companyName: string; companySlug: string; permissions: Permission[] };
type Company = {
  name: string;
  slug: string;
  legal_name?: string | null;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
  locale?: string | null;
  meta_pixel_id?: string | null;
  google_analytics_id?: string | null;
};

const defaults = ['atendimento', 'automacoes', 'relatorios', 'ai_agent', 'whatsapp', 'instagram', 'facebook'];

export default function Config() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  async function load() {
    const [fr, mr, cr] = await Promise.all([
      fetch('/api/features', { cache: 'no-store' }),
      fetch('/api/me', { cache: 'no-store' }),
      fetch('/api/settings/company', { cache: 'no-store' })
    ]);
    const [fd, md, cd] = await Promise.all([fr.json(), mr.json(), cr.json()]);
    if (fr.ok) setFlags(fd.data ?? []);
    if (mr.ok) setMe(md.data ?? null);
    if (cr.ok) setCompany(cd.data ?? null);
  }

  useEffect(() => { void load(); }, []);

  function enabled(name: string) {
    return flags.find(flag => flag.feature_name === name)?.enabled ?? false;
  }

  async function toggle(name: string) {
    setError('');
    const response = await fetch('/api/features', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ feature_name: name, enabled: !enabled(name) })
    });
    if (!response.ok) {
      setError('Seu perfil pode visualizar, mas não alterar feature flags.');
      return;
    }
    await load();
  }

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaved('');
    const fd = new FormData(event.currentTarget);
    const raw = Object.fromEntries(fd.entries());
    const body = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, String(value).trim() || null])
    );

    const response = await fetch('/api/settings/company', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error === 'invalid_payload'
        ? 'Confira o ID do Meta Pixel e o Measurement ID do Google Analytics.'
        : 'Seu perfil não possui permissão para alterar os dados da empresa.');
      return;
    }

    setSaved('Configurações atualizadas.');
    await load();
  }

  const canManage = me?.permissions.includes('features.manage') ?? false;
  const canSettings = me?.permissions.includes('settings.manage') ?? false;

  return (
    <div className="content">
      <h1 className="page-title">Configurações</h1>
      <p className="page-sub">Administração da empresa, integrações e recursos disponíveis.</p>

      {error && <div className="error">{error}</div>}
      {saved && <div className="success">{saved}</div>}

      <div className="grid settings-grid">
        <section className="card section">
          <h3>Dados da empresa</h3>
          {company && (
            <form onSubmit={saveCompany}>
              <div className="field">
                <label>Nome da empresa</label>
                <input className="input" name="name" defaultValue={company.name} required disabled={!canSettings}/>
              </div>

              <div className="form-grid settings-form">
                <div className="field">
                  <label>Razão social</label>
                  <input className="input" name="legal_name" defaultValue={company.legal_name ?? ''} disabled={!canSettings}/>
                </div>
                <div className="field">
                  <label>Documento</label>
                  <input className="input" name="document" defaultValue={company.document ?? ''} disabled={!canSettings}/>
                </div>
                <div className="field">
                  <label>Telefone</label>
                  <input className="input" name="phone" defaultValue={company.phone ?? ''} disabled={!canSettings}/>
                </div>
                <div className="field">
                  <label>E-mail</label>
                  <input className="input" type="email" name="email" defaultValue={company.email ?? ''} disabled={!canSettings}/>
                </div>
              </div>

              <div className="setting-row"><span>Tenant</span><code>{company.slug}</code></div>

              <hr/>
              <h3>Rastreamento de marketing</h3>
              <p className="muted">Cadastre os identificadores usados nas integrações de marketing. O CRM também mantém a atribuição recebida junto com cada lead, como UTM, gclid, fbclid, página de entrada e referência.</p>

              <div className="form-grid settings-form">
                <div className="field">
                  <label>Meta Pixel ID</label>
                  <input
                    className="input"
                    name="meta_pixel_id"
                    inputMode="numeric"
                    placeholder="Ex.: 123456789012345"
                    defaultValue={company.meta_pixel_id ?? ''}
                    disabled={!canSettings}
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label>Google Analytics Measurement ID</label>
                  <input
                    className="input"
                    name="google_analytics_id"
                    placeholder="Ex.: G-XXXXXXXXXX"
                    defaultValue={company.google_analytics_id ?? ''}
                    disabled={!canSettings}
                    autoComplete="off"
                  />
                </div>
              </div>

              {canSettings && <button className="btn btn-primary" style={{ marginTop: 14 }}>Salvar configurações</button>}
            </form>
          )}

          <hr/>
          <h3>Segurança</h3>
          <p className="muted">Tenant scoping no backend, RLS no PostgreSQL, RBAC por ação e proteção contra IDOR.</p>
          <p className="muted">O frontend nunca define o tenant usado pelas APIs.</p>
        </section>

        <section className="card section">
          <h3>Feature Flags</h3>
          <p className="muted">Recursos desativados ficam ocultos no menu e permanecem bloqueados no backend.</p>
          {defaults.map(feature => (
            <div className="activity" key={feature}>
              <div className="dot"/>
              <div style={{ flex: 1 }}>
                <strong>{feature}</strong>
                <div className="muted" style={{ fontSize: 12 }}>Ativação específica por empresa</div>
              </div>
              <button
                disabled={!canManage}
                className={`btn ${enabled(feature) ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => void toggle(feature)}
              >
                {enabled(feature) ? 'Ativa' : 'Inativa'}
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
