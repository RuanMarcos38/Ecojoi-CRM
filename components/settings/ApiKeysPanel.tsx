'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  active: boolean;
  last_used_at?: string | null;
  created_at: string;
};

export function ApiKeysPanel({ enabled }: { enabled: boolean }) {
  const [items, setItems] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!enabled) return;
    const response = await fetch('/api/settings/api-keys', { cache: 'no-store' });
    if (!response.ok) return;
    const payload = await response.json();
    setItems(payload.data ?? []);
  }

  useEffect(() => { void load(); }, [enabled]);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNewKey('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/settings/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: String(form.get('name') ?? '').trim() })
    });
    const payload = await response.json();
    if (!response.ok) {
      setError('Não foi possível gerar a chave de integração.');
      return;
    }
    setNewKey(payload.data?.api_key ?? '');
    event.currentTarget.reset();
    await load();
  }

  async function revoke(id: string) {
    setError('');
    const response = await fetch('/api/settings/api-keys', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id })
    });
    if (!response.ok) {
      setError('Não foi possível revogar a chave.');
      return;
    }
    await load();
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (!enabled) return null;

  return (
    <section className="card section">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
        <div>
          <h3 style={{marginBottom:4}}>API e integrações</h3>
          <p className="muted" style={{marginTop:0}}>Gere chaves para conectar formulários, ERPs, automações e outros sistemas ao CRM.</p>
        </div>
        <KeyRound size={22}/>
      </div>

      <form onSubmit={createKey} className="form-grid settings-form">
        <div className="field">
          <label>Nome da integração</label>
          <input className="input" name="name" placeholder="Ex.: Site institucional" required/>
        </div>
        <div className="field" style={{justifyContent:'flex-end'}}>
          <label>&nbsp;</label>
          <button className="btn btn-primary" type="submit"><Plus size={16}/>Gerar chave</button>
        </div>
      </form>

      {newKey && (
        <div className="success" style={{marginTop:12}}>
          <strong>Chave criada. Copie agora — ela não será exibida novamente.</strong>
          <div style={{display:'flex',gap:8,alignItems:'center',marginTop:8}}>
            <code style={{overflowWrap:'anywhere',flex:1}}>{newKey}</code>
            <button className="btn btn-secondary" type="button" onClick={copyKey}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'Copiada' : 'Copiar'}</button>
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div style={{display:'grid',gap:8,marginTop:14}}>
        {items.filter(item => item.active).map(item => (
          <div className="setting-row" key={item.id}>
            <span>
              <strong>{item.name}</strong>
              <small className="muted" style={{display:'block'}}>{item.key_prefix}•••••• · {item.last_used_at ? 'em uso' : 'ainda não utilizada'}</small>
            </span>
            <button className="btn btn-secondary" type="button" onClick={() => void revoke(item.id)}><Trash2 size={15}/>Revogar</button>
          </div>
        ))}
        {!items.some(item => item.active) && <p className="muted">Nenhuma chave ativa.</p>}
      </div>

      <p className="muted" style={{fontSize:12,marginTop:14}}>
        Documentação OpenAPI disponível em <code>/api/v1/openapi</code>. As integrações usam autenticação Bearer.
      </p>
    </section>
  );
}
