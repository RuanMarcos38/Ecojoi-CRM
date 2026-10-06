'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { CheckCircle2, MessageCircle, QrCode, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import type { Permission } from '@/lib/auth/permissions';

type Provider = 'meta' | 'evolution';

type CompanySettings = {
  whatsapp_provider?: Provider;
  evolution_instance_name?: string | null;
  meta_connector_ready?: boolean;
};

type EvolutionSettings = {
  api_url: string;
  api_key_configured: boolean;
  source: 'database' | 'environment' | 'none';
};

type WhatsAppStatus = {
  provider: Provider;
  ok: boolean;
  evolution?: {
    runtimeConfigured: boolean;
    instanceConfigured: boolean;
    instanceName?: string | null;
    state: string;
    error?: string;
  };
  meta?: {
    runtimeConfigured: boolean;
    identifiersConfigured: boolean;
  };
};

type Me = { permissions: Permission[] };

function stateLabel(state?: string) {
  if (!state || state === 'not_configured') return 'Não configurado';
  if (state === 'open' || state === 'connected') return 'Conectado';
  if (state === 'connecting') return 'Aguardando conexão';
  if (state === 'close' || state === 'closed') return 'Desconectado';
  if (state === 'error') return 'Erro de conexão';
  return state;
}

export function WhatsAppConnectionPanel() {
  const [provider, setProvider] = useState<Provider>('evolution');
  const [instanceName, setInstanceName] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [companyResponse, evolutionResponse, statusResponse, meResponse] = await Promise.all([
      fetch('/api/settings/company', { cache: 'no-store' }),
      fetch('/api/integrations/whatsapp/evolution/settings', { cache: 'no-store' }),
      fetch('/api/integrations/whatsapp/status', { cache: 'no-store' }),
      fetch('/api/me', { cache: 'no-store' })
    ]);

    const [companyPayload, evolutionPayload, statusPayload, mePayload] = await Promise.all([
      companyResponse.json().catch(() => null),
      evolutionResponse.json().catch(() => null),
      statusResponse.json().catch(() => null),
      meResponse.json().catch(() => null)
    ]);

    if (companyResponse.ok) {
      const company = (companyPayload?.data ?? {}) as CompanySettings;
      setProvider(company.whatsapp_provider === 'evolution' ? 'evolution' : 'meta');
      setInstanceName(company.evolution_instance_name ?? '');
    }

    if (evolutionResponse.ok) {
      const evolution = (evolutionPayload?.data ?? {}) as EvolutionSettings;
      setApiUrl(evolution.api_url ?? '');
      setApiKeyConfigured(Boolean(evolution.api_key_configured));
    }

    if (statusResponse.ok) setStatus(statusPayload?.data ?? null);

    if (meResponse.ok) {
      const me = (mePayload?.data ?? {}) as Me;
      setCanManage(me.permissions?.includes('settings.manage') ?? false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveProvider(nextProvider: Provider) {
    setProvider(nextProvider);
    setError('');
    setNotice('');
    setQrCode(null);
    setPairingCode(null);

    if (!canManage) return;

    const response = await fetch('/api/settings/company', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ whatsapp_provider: nextProvider })
    });

    if (!response.ok) {
      setError('Não foi possível alterar o provedor do WhatsApp.');
      return;
    }

    setNotice(nextProvider === 'evolution'
      ? 'Evolution API selecionada. Preencha os dados abaixo para conectar.'
      : 'Meta Cloud API selecionada.');
    await load();
  }

  async function connectEvolution() {
    if (!apiUrl.trim()) {
      setError('Informe a URL da Evolution API.');
      return;
    }
    if (!instanceName.trim()) {
      setError('Informe o nome da instância Evolution.');
      return;
    }
    if (!apiKeyConfigured && !apiKey.trim()) {
      setError('Informe a API Key da Evolution API.');
      return;
    }

    setBusy('connect');
    setError('');
    setNotice('');
    setQrCode(null);
    setPairingCode(null);

    try {
      const credentialsBody: Record<string, string> = { api_url: apiUrl.trim() };
      if (apiKey.trim()) credentialsBody.api_key = apiKey.trim();

      const credentialsResponse = await fetch('/api/integrations/whatsapp/evolution/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(credentialsBody)
      });
      const credentialsPayload = await credentialsResponse.json().catch(() => null);

      if (!credentialsResponse.ok) {
        setError(credentialsPayload?.error === 'evolution_api_key_required'
          ? 'Informe a API Key da Evolution API.'
          : 'Não foi possível salvar as credenciais da Evolution API.');
        return;
      }

      setApiKey('');
      setApiKeyConfigured(true);

      const companyResponse = await fetch('/api/settings/company', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          whatsapp_provider: 'evolution',
          evolution_instance_name: instanceName.trim()
        })
      });

      if (!companyResponse.ok) {
        setError('Não foi possível salvar a instância do WhatsApp.');
        return;
      }

      const connectResponse = await fetch('/api/integrations/whatsapp/evolution/connect', {
        method: 'POST'
      });
      const connectPayload = await connectResponse.json().catch(() => null);

      if (!connectResponse.ok) {
        setError(connectPayload?.detail || 'Não foi possível iniciar a conexão com a Evolution API.');
        return;
      }

      const data = connectPayload?.data ?? {};
      setQrCode(data.qr ?? null);
      setPairingCode(data.pairingCode ?? null);

      if (data.qr) {
        setNotice('QR Code gerado. Escaneie no WhatsApp para concluir a conexão.');
      } else if (data.connected) {
        setNotice('Esta instância já está conectada. Uma sessão ativa não gera novo QR Code.');
      } else if (data.pairingCode) {
        setNotice('Código de pareamento gerado. Você pode usá-lo no WhatsApp se preferir ao QR Code.');
      } else {
        setNotice('Conexão iniciada. Clique em “Verificar status” em alguns segundos.');
      }

      await load();
    } finally {
      setBusy('');
    }
  }

  async function refreshStatus() {
    setBusy('status');
    setError('');
    await load();
    setBusy('');
  }

  const connected = status?.provider === 'evolution' && status?.ok;
  const evolutionState = status?.evolution?.state;

  return (
    <section id="whatsapp" className="card section" style={{ gridColumn: '1 / -1' }}>
      <div className="automation-top" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageCircle size={20}/> WhatsApp
          </h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            Escolha entre Meta Cloud API e Evolution API por QR Code. Conversas, contatos, filas e IA permanecem na mesma estrutura.
          </p>
        </div>
        <span className={status?.ok ? 'success' : 'muted'} style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
          {status?.ok ? 'Canal conectado' : 'Conexão pendente'}
        </span>
      </div>

      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
      {notice && <div className="success" style={{ marginTop: 12 }}>{notice}</div>}

      <div className="form-grid" style={{ marginTop: 14 }}>
        <button
          type="button"
          className={`btn ${provider === 'meta' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => void saveProvider('meta')}
          disabled={!canManage}
          style={{ minHeight: 56, justifyContent: 'flex-start' }}
        >
          <ShieldCheck size={18}/>
          <span style={{ textAlign: 'left' }}>
            <strong style={{ display: 'block' }}>Meta Cloud API</strong>
            <small>API oficial do WhatsApp Business</small>
          </span>
        </button>

        <button
          type="button"
          className={`btn ${provider === 'evolution' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => void saveProvider('evolution')}
          disabled={!canManage}
          style={{ minHeight: 56, justifyContent: 'flex-start' }}
        >
          <QrCode size={18}/>
          <span style={{ textAlign: 'left' }}>
            <strong style={{ display: 'block' }}>Evolution API</strong>
            <small>Conexão por QR Code / sessão WhatsApp</small>
          </span>
        </button>
      </div>

      {provider === 'meta' ? (
        <div style={{ marginTop: 16, padding: 14, border: '1px solid #e5e9e7', borderRadius: 10 }}>
          <div className="setting-row">
            <span>
              <strong>WhatsApp Business Cloud API</strong>
              <small className="muted" style={{ display: 'block' }}>
                {status?.meta?.identifiersConfigured ? 'Identificadores Meta cadastrados.' : 'Cadastre WABA ID e Phone Number ID em Configurações.'}
              </small>
            </span>
            <span className={status?.ok ? 'success' : 'muted'}>
              {status?.ok ? 'Operacional' : 'Pendente'}
            </span>
          </div>
          <a className="btn btn-secondary" href="/app/configuracoes" style={{ marginTop: 10 }}>
            Configurar IDs da Meta
          </a>
        </div>
      ) : (
        <div style={{ marginTop: 16, padding: 14, border: '1px solid #e5e9e7', borderRadius: 10, background: '#fafcfb' }}>
          <div className="form-grid settings-form">
            <div className="field">
              <label>URL da Evolution API</label>
              <input
                className="input"
                type="url"
                value={apiUrl}
                onChange={event => setApiUrl(event.target.value)}
                placeholder="https://evolution.seudominio.com"
                disabled={!canManage}
              />
            </div>
            <div className="field">
              <label>API Key Evolution</label>
              <input
                className="input"
                type="password"
                value={apiKey}
                onChange={event => setApiKey(event.target.value)}
                placeholder={apiKeyConfigured ? 'Chave já configurada — deixe vazio para manter' : 'Cole a API Key'}
                disabled={!canManage}
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label>Nome da instância</label>
              <input
                className="input"
                value={instanceName}
                onChange={event => setInstanceName(event.target.value)}
                placeholder="Ecojoi - Prospecto"
                disabled={!canManage}
              />
            </div>
            <div className="field">
              <label>Status da instância</label>
              <div className="input" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {connected ? <CheckCircle2 size={16}/> : <Smartphone size={16}/>}
                <span>{stateLabel(evolutionState)}</span>
              </div>
            </div>
          </div>

          <div className="inlineActions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void connectEvolution()}
              disabled={!canManage || busy === 'connect'}
            >
              <QrCode size={15}/>
              {busy === 'connect' ? 'Conectando...' : connected ? 'Verificar / reconectar' : 'Salvar e gerar QR Code'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void refreshStatus()}
              disabled={busy === 'status'}
            >
              <RefreshCw size={15}/>
              {busy === 'status' ? 'Atualizando...' : 'Verificar status'}
            </button>
          </div>

          {connected && !qrCode && (
            <div className="success" style={{ marginTop: 12 }}>
              A instância <strong>{instanceName || 'Evolution'}</strong> já está conectada. Por segurança, a Evolution não gera um novo QR para uma sessão ativa.
              Para conectar outro número, informe outro nome de instância e clique em “Salvar e gerar QR Code”.
            </div>
          )}

          {(qrCode || pairingCode) && (
            <div style={{ marginTop: 14, display: 'grid', gap: 12, justifyItems: 'center', padding: 16, background: '#fff', border: '1px solid #e5e9e7', borderRadius: 10 }}>
              {qrCode && (
                <>
                  <Image
                    src={qrCode}
                    alt="QR Code para conectar o WhatsApp"
                    width={300}
                    height={300}
                    unoptimized
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                  <strong>Escaneie com o WhatsApp</strong>
                  <small className="muted">WhatsApp → Aparelhos conectados → Conectar aparelho.</small>
                </>
              )}
              {pairingCode && (
                <div style={{ textAlign: 'center' }}>
                  <small className="muted">Código de pareamento</small>
                  <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 3, marginTop: 4 }}>{pairingCode}</div>
                </div>
              )}
            </div>
          )}

          <p className="muted" style={{ margin: '12px 0 0', fontSize: 12 }}>
            A API Key é salva somente no backend protegido e não volta a ser exibida no navegador.
          </p>
        </div>
      )}
    </section>
  );
}
