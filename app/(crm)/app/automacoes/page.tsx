'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, CheckCircle2, FileUp, Link2, Plus, Power, RefreshCw, Trash2 } from 'lucide-react';

type Automation = {
  id: string;
  name: string;
  trigger_type: string;
  action_type: string;
  enabled: boolean;
};

type N8nSettings = {
  n8n_ai_enabled?: boolean;
  n8n_webhook_url?: string | null;
  n8n_workflow_id?: string | null;
  importConfigured?: boolean;
  aiEnabled?: boolean;
  webhookConfigured?: boolean;
  workflowId?: string | null;
};

const triggerLabels: Record<string, string> = {
  lead_created: 'Novo lead',
  conversation_idle: 'Conversa sem resposta',
  deal_won: 'Negócio ganho',
  task_overdue: 'Tarefa vencida'
};

const actionLabels: Record<string, string> = {
  create_task: 'Criar tarefa',
  notify_user: 'Notificar usuário',
  change_stage: 'Alterar etapa',
  internal_message: 'Mensagem interna'
};

export default function Automacoes() {
  const [rows, setRows] = useState<Automation[]>([]);
  const [n8n, setN8n] = useState<N8nSettings | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingN8n, setSavingN8n] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    const [automationResponse, n8nResponse] = await Promise.all([
      fetch('/api/automations', { cache: 'no-store' }),
      fetch('/api/integrations/n8n/settings', { cache: 'no-store' })
    ]);

    const [automationPayload, n8nPayload] = await Promise.all([
      automationResponse.json().catch(() => null),
      n8nResponse.json().catch(() => null)
    ]);

    if (automationResponse.ok) setRows(automationPayload?.data ?? []);
    else setError('Automações indisponíveis para este usuário ou empresa.');

    if (n8nResponse.ok) setN8n(n8nPayload?.data ?? null);
  }

  useEffect(() => { void load(); }, []);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get('name'),
      trigger_type: fd.get('trigger_type'),
      action_type: fd.get('action_type'),
      enabled: true,
      config: {}
    };
    const r = await fetch('/api/automations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.ok) {
      setOpen(false);
      setNotice('Automação criada.');
      await load();
    }
  }

  async function toggle(a: Automation) {
    await fetch(`/api/automations/${a.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !a.enabled })
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta automação?')) return;
    await fetch(`/api/automations/${id}`, { method: 'DELETE' });
    await load();
  }

  async function saveN8n(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingN8n(true);
    setError('');
    setNotice('');

    const fd = new FormData(e.currentTarget);
    const response = await fetch('/api/integrations/n8n/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        n8n_ai_enabled: fd.get('n8n_ai_enabled') === 'on',
        n8n_webhook_url: String(fd.get('n8n_webhook_url') ?? '').trim() || null
      })
    });

    setSavingN8n(false);
    if (response.ok) {
      setNotice('Integração n8n atualizada.');
      await load();
    } else {
      setError('Não foi possível salvar a integração n8n.');
    }
  }

  async function importWorkflow(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError('');
    setNotice('');

    const form = new FormData();
    form.append('file', file);
    const response = await fetch('/api/integrations/n8n/workflows/import', {
      method: 'POST',
      body: form
    });
    const payload = await response.json().catch(() => null);
    setImporting(false);
    event.target.value = '';

    if (response.ok) {
      setNotice(`Workflow "${payload?.data?.name ?? file.name}" importado para o n8n.`);
      await load();
      return;
    }

    const messages: Record<string, string> = {
      n8n_api_not_configured: 'A conexão administrativa com o n8n ainda não está configurada no servidor.',
      invalid_workflow_json: 'O arquivo selecionado não é um workflow JSON válido.',
      workflow_nodes_required: 'O JSON não possui nós de workflow.',
      workflow_connections_required: 'O JSON não possui as conexões do workflow.',
      workflow_file_too_large: 'O workflow deve ter no máximo 2 MB.'
    };
    setError(messages[payload?.error] ?? 'Não foi possível importar o workflow no n8n.');
  }

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Automações</h1>
          <p className="page-sub">Regras comerciais e orquestração do atendimento.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(value => !value)}>
          <Plus size={16}/>Nova automação
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}

      <section className="card section">
        <div className="automation-top">
          <div>
            <h3 style={{marginBottom:4}}>n8n · Agente IA</h3>
            <p className="muted" style={{margin:0,fontSize:12}}>Conecte o workflow que processa as conversas do atendimento.</p>
          </div>
          <span className={n8n?.aiEnabled && n8n?.webhookConfigured ? 'badge' : 'badge badge-off'}>
            {n8n?.aiEnabled && n8n?.webhookConfigured ? 'Ativo' : 'Pendente'}
          </span>
        </div>

        <form onSubmit={saveN8n} className="form-grid" style={{marginTop:14}}>
          <div className="field">
            <label>Webhook do workflow IA</label>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <Link2 size={16}/>
              <input
                className="input"
                name="n8n_webhook_url"
                type="url"
                placeholder="https://seu-n8n/webhook/..."
                defaultValue={n8n?.n8n_webhook_url ?? ''}
              />
            </div>
          </div>
          <div className="field">
            <label>Atendimento automático</label>
            <label className="setting-row" style={{border:0,padding:0,minHeight:36}}>
              <span>Enviar novas mensagens ao agente n8n</span>
              <input name="n8n_ai_enabled" type="checkbox" defaultChecked={n8n?.n8n_ai_enabled === true}/>
            </label>
          </div>
          <div className="inlineActions">
            <button className="btn btn-primary" disabled={savingN8n}>
              {savingN8n ? <RefreshCw size={15}/> : <CheckCircle2 size={15}/>}
              {savingN8n ? 'Salvando' : 'Salvar integração'}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={importing || n8n?.importConfigured !== true}
            >
              <FileUp size={15}/>{importing ? 'Importando' : 'Importar workflow JSON'}
            </button>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={importWorkflow}/>
          </div>
        </form>

        <div className="report-grid" style={{marginTop:14}}>
          <div><span>Webhook</span><strong style={{fontSize:16}}>{n8n?.webhookConfigured ? 'Configurado' : 'Pendente'}</strong></div>
          <div><span>Importação</span><strong style={{fontSize:16}}>{n8n?.importConfigured ? 'Disponível' : 'Servidor pendente'}</strong></div>
          <div><span>Workflow</span><strong style={{fontSize:16}}>{n8n?.workflowId ? 'Importado' : 'Não importado'}</strong></div>
          <div><span>WhatsApp IA</span><strong style={{fontSize:16}}>{n8n?.aiEnabled ? 'Habilitado' : 'Desabilitado'}</strong></div>
        </div>
      </section>

      {open && (
        <form className="card section" onSubmit={create}>
          <div className="form-grid">
            <div className="field"><label>Nome</label><input className="input" name="name" required/></div>
            <div className="field"><label>Gatilho</label><select className="select" name="trigger_type">{Object.entries(triggerLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></div>
            <div className="field"><label>Ação</label><select className="select" name="action_type">{Object.entries(actionLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></div>
          </div>
          <button className="btn btn-primary" style={{marginTop:12}}>Salvar regra</button>
        </form>
      )}

      <div className="automation-grid">
        {rows.length ? rows.map(a => (
          <article className="card automation-card" key={a.id}>
            <div className="automation-top">
              <span className={`badge ${a.enabled ? '' : 'badge-off'}`}>{a.enabled ? 'Ativa' : 'Pausada'}</span>
              <div className="row-actions">
                <button className="btn btn-secondary icon-btn" onClick={() => void toggle(a)} title="Ativar/Pausar"><Power size={15}/></button>
                <button className="btn btn-danger icon-btn" onClick={() => void remove(a.id)} title="Excluir"><Trash2 size={15}/></button>
              </div>
            </div>
            <h3>{a.name}</h3>
            <p className="muted">{triggerLabels[a.trigger_type] ?? a.trigger_type} → {actionLabels[a.action_type] ?? a.action_type}</p>
          </article>
        )) : (
          <div className="card empty"><Bot size={18}/> Nenhuma automação cadastrada.</div>
        )}
      </div>
    </div>
  );
}
