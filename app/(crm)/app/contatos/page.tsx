'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  Filter,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UsersRound,
  UserX,
  X
} from 'lucide-react';
import styles from '../commercial.module.css';

type ContactStatus = 'lead' | 'active' | 'inactive';
type Contact = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status: ContactStatus;
  created_at?: string;
};

const statusLabel: Record<ContactStatus, string> = {
  lead: 'Lead',
  active: 'Cliente ativo',
  inactive: 'Inativo'
};

const statusClass: Record<ContactStatus, string> = {
  lead: styles.statusLead,
  active: styles.statusActive,
  inactive: styles.statusInactive
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'EC';
}

export default function Contatos() {
  const [rows, setRows] = useState<Contact[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ContactStatus>('all');

  async function load() {
    const response = await fetch('/api/contacts', { cache: 'no-store' });
    const payload = await response.json();
    if (response.ok) setRows(payload.data ?? []);
    else setError('Não foi possível carregar contatos.');
  }

  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => ({
    total: rows.length,
    leads: rows.filter(row => row.status === 'lead').length,
    active: rows.filter(row => row.status === 'active').length,
    inactive: rows.filter(row => row.status === 'inactive').length
  }), [rows]);

  const sourceSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const source = row.source?.trim() || 'Sem origem';
      map.set(source, (map.get(source) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter(row => {
      const text = [row.name, row.email, row.phone, row.source].filter(Boolean).join(' ').toLowerCase();
      return (!term || text.includes(term)) && (statusFilter === 'all' || row.status === statusFilter);
    });
  }, [query, rows, statusFilter]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    const body = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? '').trim() || null,
      phone: String(form.get('phone') ?? '').trim() || null,
      source: String(form.get('source') ?? '').trim() || null,
      status: form.get('status')
    };
    const response = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    setSaving(false);
    if (response.ok) {
      setOpen(false);
      setNotice('Contato criado e disponível para atendimento, tarefas e oportunidades.');
      await load();
    } else {
      setError('Não foi possível salvar o contato.');
    }
  }

  async function status(id: string, value: ContactStatus) {
    setError('');
    setNotice('');
    const response = await fetch(`/api/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: value })
    });
    if (!response.ok) setError('Sem permissão para alterar este contato.');
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Excluir este contato?')) return;
    const response = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    if (!response.ok) setError('Não foi possível excluir. O contato pode possuir vínculos ou seu perfil não possui permissão.');
    await load();
  }

  async function start(id: string) {
    setError('');
    const response = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contact_id: id, channel: 'internal' })
    });
    if (response.ok) window.location.href = '/app/atendimento';
    else setError('Não foi possível iniciar o atendimento.');
  }

  async function createDeal(contact: Contact) {
    setError('');
    const response = await fetch('/api/deals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: `Oportunidade - ${contact.name}`,
        contact_id: contact.id,
        stage: 'new',
        value: 0,
        probability: contact.status === 'lead' ? 10 : 25
      })
    });
    if (response.ok) window.location.href = '/app/pipeline';
    else setError('Não foi possível criar a oportunidade para este contato.');
  }

  return <div className={`content ${styles.page}`}>
    <div className={styles.hero}>
      <div>
        <h1 className="page-title">Contatos</h1>
        <p className="page-sub">Central de clientes, leads e relacionamentos para atendimento, tarefas e vendas.</p>
      </div>
      <div className={styles.heroActions}>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(value => !value)}>{open ? <X size={17}/> : <Plus size={17}/>} {open ? 'Fechar' : 'Novo contato'}</button>
      </div>
    </div>

    <section className={styles.kpiGrid} aria-label="Resumo de contatos">
      <article className={styles.kpi}><span className={styles.kpiIcon}><UsersRound size={18}/></span><span>Total da base</span><strong>{summary.total}</strong><small>contatos cadastrados</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconBlue}`}><BriefcaseBusiness size={18}/></span><span>Leads</span><strong>{summary.leads}</strong><small>em qualificação comercial</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconAmber}`}><UserCheck size={18}/></span><span>Clientes ativos</span><strong>{summary.active}</strong><small>prontos para relacionamento</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconRose}`}><UserX size={18}/></span><span>Inativos</span><strong>{summary.inactive}</strong><small>podem entrar em reativação</small></article>
    </section>

    <section className={styles.toolbar} aria-label="Filtros de contatos">
      <label className={styles.searchField}><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nome, e-mail, telefone ou origem"/></label>
      <label className={styles.selectField}><Filter size={16}/><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as 'all' | ContactStatus)}><option value="all">Todos os status</option><option value="lead">Leads</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
      <label className={styles.selectField}><UsersRound size={16}/><select value="all" onChange={() => undefined} aria-label="Visualização"><option value="all">Cartões comerciais</option></select></label>
    </section>

    {error && <div className="error">{error}</div>}
    {notice && <div className="success">{notice}</div>}

    {open && <form className={styles.formPanel} onSubmit={submit}>
      <div><h3>Novo contato</h3><p className={styles.sideHint}>Cadastre a pessoa uma vez e use a mesma base em atendimento, oportunidades e tarefas.</p></div>
      <div className={styles.formGrid}>
        <div className="field"><label>Nome</label><input className="input" name="name" required/></div>
        <div className="field"><label>E-mail</label><input className="input" type="email" name="email"/></div>
        <div className="field"><label>Telefone</label><input className="input" name="phone"/></div>
        <div className="field"><label>Origem</label><input className="input" name="source" placeholder="Site, Instagram, indicação..."/></div>
        <div className="field"><label>Status</label><select className="select" name="status" defaultValue="lead"><option value="lead">Lead</option><option value="active">Cliente ativo</option><option value="inactive">Inativo</option></select></div>
      </div>
      <div className={styles.formFooter}><button className="btn btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar contato'}</button></div>
    </form>}

    <div className={styles.workspace}>
      <section className={styles.cardGrid} aria-label="Lista de contatos">
        {filteredRows.length ? filteredRows.map(row => <article className={styles.recordCard} key={row.id}>
          <div className={styles.recordTop}>
            <div className={styles.identity}>
              <span className={styles.avatar}>{initials(row.name)}</span>
              <div className={styles.identityCopy}><strong>{row.name}</strong><span>{row.source || 'Origem não informada'}</span></div>
            </div>
            <span className={`${styles.statusBadge} ${statusClass[row.status]}`}>{statusLabel[row.status]}</span>
          </div>
          <div className={styles.metaList}>
            <div className={styles.metaLine}><Mail size={15}/><span>{row.email || 'E-mail não informado'}</span></div>
            <div className={styles.metaLine}><Phone size={15}/><span>{row.phone || 'Telefone não informado'}</span></div>
          </div>
          <div className={styles.cardActions}>
            <select className="select compact-select" value={row.status} onChange={event => void status(row.id, event.target.value as ContactStatus)} aria-label="Alterar status do contato"><option value="lead">Lead</option><option value="active">Cliente ativo</option><option value="inactive">Inativo</option></select>
            <button type="button" className="btn btn-secondary icon-btn" onClick={() => void start(row.id)} title="Iniciar atendimento" aria-label="Iniciar atendimento"><MessageSquare size={15}/></button>
            <button type="button" className="btn btn-secondary icon-btn" onClick={() => void createDeal(row)} title="Criar oportunidade" aria-label="Criar oportunidade"><BriefcaseBusiness size={15}/></button>
            <button type="button" className="btn btn-danger icon-btn" onClick={() => void remove(row.id)} title="Excluir" aria-label="Excluir contato"><Trash2 size={15}/></button>
          </div>
        </article>) : <div className={styles.emptyState}>Nenhum contato encontrado com os filtros atuais.</div>}
      </section>

      <aside className={styles.sidePanel}>
        <h3>Origem dos contatos</h3>
        <p className={styles.sideHint}>Acompanhe de onde a base está vindo para priorizar canais de aquisição.</p>
        <div className={styles.sourceList}>
          {sourceSummary.length ? sourceSummary.map(([source, count]) => <div className={styles.sourceItem} key={source}>
            <div className={styles.sourceItemTop}><strong>{source}</strong><span>{count}</span></div>
            <div className={styles.progressTrack}><i style={{ width: `${Math.max(8, (count / Math.max(1, summary.total)) * 100)}%` }}/></div>
          </div>) : <div className={styles.emptyState}>Sem origem registrada.</div>}
        </div>
      </aside>
    </div>
  </div>;
}
