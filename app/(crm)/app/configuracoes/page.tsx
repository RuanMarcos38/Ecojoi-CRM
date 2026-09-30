'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Permission } from '@/lib/auth/permissions';
import { ApiKeysPanel } from '@/components/settings/ApiKeysPanel';

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
  auto_assign_leads?: boolean;
  meta_business_id?: string | null;
  meta_waba_id?: string | null;
  meta_phone_number_id?: string | null;
  meta_page_id?: string | null;
  meta_instagram_account_id?: string | null;
  meta_connector_ready?: boolean;
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
    delete raw.auto_assign_leads;

    const body: Record<string, unknown> = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, String(value).trim() || null])
    );
    body.auto_assign_leads = fd.get('auto_assign_leads') === 'on';

    const response = await fetch('/api/settings/company', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error === 'invalid_payload'
        ? 'Confira os dados informados nas configurações.'
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
      <p className="page-sub">Empresa, canais, distribuição e integrações.</p>

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
                <div className="field"><label>Razão social</label><input className="input" name="legal_name" defaultValue={company.legal_name ?? ''} disabled={!canSettings}/></div>
                <div className="field"><label>Documento</label><input className="input" name="document" defaultValue={company.document ?? ''} disabled={!canSettings}/></div>
                <div className="field"><label>Telefone</label><input className="input" name="phone" defaultValue={company.phone ?? ''} disabled={!canSettings}/></div>
                <div className="field"><label>E-mail</label><input className="input" type="email" name="email" defaultValue={company.email ?? ''} disabled={!canSettings}/></div>
              </div>

              <div className="setting-row"><span>Tenant</span><code>{company.slug}</code></div>

              <hr/>
              <h3>Atendimento e distribuição</h3>
              <div className="setting-row">
                <span><strong>Distribuir novos leads automaticamente</strong><small className="muted" style={{display:'block'}}>Round-robin entre usuários ativos da empresa.</small></span>
                <input type="checkbox" name="auto_assign_leads" defaultChecked={company.auto_assign_leads !== false} disabled={!canSettings} aria-label="Distribuir leads automaticamente"/>
              </div>

              <hr/>
              <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}>
                <div>
                  <h3 style={{marginBottom:4}}>Meta · WhatsApp, Facebook e Instagram</h3>
                  <p className="muted" style={{marginTop:0}}>Identificadores da conta conectada. Tokens e segredos permanecem somente no servidor.</p>
                </div>
                <span className={company.meta_connector_ready ? 'success' : 'muted'} style={{whiteSpace:'nowrap',fontSize:12}}>
                  {company.meta_connector_ready ? 'Conector ativo' : 'Conector pendente'}
                </span>
              </div>

              <div className="form-grid settings-form">
                <div className="field"><label>Meta Business ID</label><input className="input" name="meta_business_id" defaultValue={company.meta_business_id ?? ''} disabled={!canSettings}/></div>
                <div className="field"><label>WhatsApp Business Account ID</label><input className="input" name="meta_waba_id" defaultValue={company.meta_waba_id ?? ''} disabled={!canSettings}/></div>
                <div className="field"><label>WhatsApp Phone Number ID</label><input className="input" name="meta_phone_number_id" defaultValue={company.meta_phone_number_id ?? ''} disabled={!canSettings}/></div>
                <div className="field"><label>Facebook Page ID</label><input className="input" name="meta_page_id" defaultValue={company.meta_page_id ?? ''} disabled={!canSettings}/></div>
                <div className="field"><label>Instagram Account ID</label><input className="input" name="meta_instagram_account_id" defaultValue={company.meta_instagram_account_id ?? ''} disabled={!canSettings}/></div>
              </div>

              <hr/>
              <h3>Rastreamento de marketing</h3>
              <p className="muted">UTMs, gclid, fbclid e origem são vinculados ao lead quando enviados pela integração.</p>
              <div className="form-grid settings-form">
                <div className="field"><label>Meta Pixel ID</label><input className="input" name="meta_pixel_id" inputMode="numeric" placeholder="123456789012345" defaultValue={company.meta_pixel_id ?? ''} disabled={!canSettings} autoComplete="off"/></div>
                <div className="field"><label>Google Analytics Measurement ID</label><input className="input" name="google_analytics_id" placeholder="G-XXXXXXXXXX" defaultValue={company.google_analytics_id ?? ''} disabled={!canSettings} autoComplete="off"/></div>
              </div>

              {canSettings && <button className="btn btn-primary" style={{ marginTop: 14 }}>Salvar configurações</button>}
            </form>
          )}

          <hr/>
          <h3>Segurança</h3>
          <p className="muted">Isolamento por empresa, permissões por perfil e credenciais sensíveis somente no servidor.</p>
        </section>

        <section className="card section">
          <h3>Recursos</h3>
          <p className="muted">Controle dos módulos disponíveis para a empresa.</p>
          {defaults.map(feature => (
            <div className="activity" key={feature}>
              <div className="dot"/>
              <div style={{ flex: 1 }}><strong>{feature}</strong><div className="muted" style={{ fontSize: 12 }}>Ativação específica por empresa</div></div>
              <button disabled={!canManage} className={`btn ${enabled(feature) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => void toggle(feature)}>
                {enabled(feature) ? 'Ativa' : 'Inativa'}
              </button>
            </div>
          ))}
        </section>

        <ApiKeysPanel enabled={canSettings}/>
      </div>
    </div>
  );
}
