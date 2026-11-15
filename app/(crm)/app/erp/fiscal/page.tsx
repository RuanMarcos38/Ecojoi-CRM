'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';

type Settings = {
  company: { legal_name: string | null; has_company_document: boolean };
  fiscal: {
    state_code: string; state_registration: string; tax_regime: string;
    municipality_code: string; postal_code: string; address_line: string;
    integration_method: 'provider' | 'direct';
  } | null;
};

const states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

export default function FiscalSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/erp/fiscal/settings', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted) setSettings(data);
      })
      .catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar as configurações fiscais.'); });
    return () => controller.abort();
  }, [refresh]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const input = {
      ...values,
      state_registration: String(values.state_registration).replace(/\D/g, ''),
      postal_code: String(values.postal_code).replace(/\D/g, '')
    };
    try {
      const response = await fetch('/api/erp/fiscal/settings', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error || 'Não foi possível salvar.');
        return;
      }
      setNotice('Rascunho fiscal salvo. A emissão depende de validação e homologação.');
      setRefresh(current => current + 1);
    } catch {
      setError('Falha de comunicação ao salvar o cadastro.');
    } finally {
      setBusy(false);
    }
  }

  const draft = settings?.fiscal;

  return <div className="content">
    <h1 className="page-title">ERP · Fiscal</h1>
    <p className="page-sub">Preparação do estabelecimento emissor para NF-e modelo 55.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="success" role="status">{notice}</p>}

    <section className="card section">
      <h2>Etapas da configuração</h2>
      <ol>
        <li>Cadastro da empresa — {settings?.company.legal_name && settings.company.has_company_document ? 'preenchido, aguarda conferência fiscal' : 'razão social e CNPJ pendentes de conferência'}</li>
        <li>Dados do estabelecimento — {draft ? 'rascunho salvo, aguarda validação' : 'pendente'}</li>
        <li>Credenciamento e certificado ou provedor — pendentes de validação</li>
        <li>Série, numeração, naturezas de operação e cadastro fiscal de produtos — pendentes</li>
        <li>Homologação e autorização em produção — pendentes</li>
      </ol>
      <Link href="/app/configuracoes" className="btn btn-secondary">Abrir cadastro da empresa</Link>
    </section>

    {settings && <section className="card section">
      <h2>Dados do estabelecimento</h2>
      {settings.company.legal_name && <p>{settings.company.legal_name}</p>}
      <form className="form-grid" onSubmit={save}>
        <label className="field">UF<select className="select" name="state_code" defaultValue={draft?.state_code ?? ''} required>
          <option value="">Selecione</option>{states.map(state => <option key={state}>{state}</option>)}
        </select></label>
        <label className="field">Inscrição estadual<input className="input" name="state_registration" defaultValue={draft?.state_registration} maxLength={20} required/></label>
        <label className="field">Código do regime tributário (CRT)<select className="select" name="tax_regime" defaultValue={draft?.tax_regime ?? ''} required>
          <option value="">Confirme com a contabilidade</option>{['1','2','3','4'].map(code => <option key={code}>{code}</option>)}
        </select></label>
        <label className="field">Código IBGE do município<input className="input" name="municipality_code" inputMode="numeric" pattern="[0-9]{7}" defaultValue={draft?.municipality_code} maxLength={7} required/></label>
        <label className="field">CEP<input className="input" name="postal_code" inputMode="numeric" defaultValue={draft?.postal_code} maxLength={9} required/></label>
        <label className="field">Endereço fiscal<input className="input" name="address_line" defaultValue={draft?.address_line} maxLength={160} required/></label>
        <label className="field">Integração prevista<select className="select" name="integration_method" defaultValue={draft?.integration_method ?? ''} required>
          <option value="">Selecione</option><option value="provider">Emissor ou provedor fiscal</option><option value="direct">Integração direta com a SEFAZ</option>
        </select></label>
        <div><button className="btn btn-primary" disabled={busy}>Salvar rascunho fiscal</button></div>
      </form>
    </section>}
  </div>;
}
