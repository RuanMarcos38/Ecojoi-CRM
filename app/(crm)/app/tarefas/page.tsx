'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  ContactRound,
  Filter,
  ListChecks,
  Plus,
  Search,
  Siren,
  Trash2,
  X
} from 'lucide-react';
import styles from '../commercial.module.css';

type TaskStatus = 'pending' | 'doing' | 'done' | 'cancelled';
type Priority = 'low' | 'medium' | 'high';
type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: Priority;
  due_at?: string | null;
  created_at?: string;
  contact?: { id: string; name: string } | null;
};
type Contact = { id: string; name: string };

const statusLabel: Record<TaskStatus, string> = {
  pending: 'Pendente',
  doing: 'Em andamento',
  done: 'Concluída',
  cancelled: 'Cancelada'
};
const statusSubtitle: Record<TaskStatus, string> = {
  pending: 'Aguardando início',
  doing: 'Em execução',
  done: 'Finalizadas',
  cancelled: 'Sem continuidade'
};
const statusClass: Record<TaskStatus, string> = {
  pending: styles.statusPending,
  doing: styles.statusDoing,
  done: styles.statusDone,
  cancelled: styles.statusCancelled
};
const priorityLabel: Record<Priority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta'
};
const priorityClass: Record<Priority, string> = {
  low: styles.priorityLow,
  medium: styles.priorityMedium,
  high: styles.priorityHigh
};
const statuses: TaskStatus[] = ['pending', 'doing', 'done', 'cancelled'];

function isOverdue(task: Task) {
  if (!task.due_at || task.status === 'done' || task.status === 'cancelled') return false;
  return new Date(task.due_at).getTime() < Date.now();
}

function dueLabel(value?: string | null) {
  if (!value) return 'Sem prazo';
  return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function Tarefas() {
  const [rows, setRows] = useState<Task[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');

  async function load() {
    const [tasksResponse, contactsResponse] = await Promise.all([
      fetch('/api/tasks', { cache: 'no-store' }),
      fetch('/api/contacts', { cache: 'no-store' })
    ]);
    const [tasksPayload, contactsPayload] = await Promise.all([tasksResponse.json(), contactsResponse.json()]);
    if (tasksResponse.ok) setRows(tasksPayload.data ?? []);
    else setError('Não foi possível carregar tarefas.');
    if (contactsResponse.ok) setContacts(contactsPayload.data ?? []);
  }

  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => ({
    total: rows.length,
    open: rows.filter(row => row.status === 'pending' || row.status === 'doing').length,
    overdue: rows.filter(isOverdue).length,
    done: rows.filter(row => row.status === 'done').length
  }), [rows]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter(row => {
      const text = [row.title, row.description, row.contact?.name].filter(Boolean).join(' ').toLowerCase();
      const matchesQuery = !term || text.includes(term);
      const matchesPriority = priorityFilter === 'all' || row.priority === priorityFilter;
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      return matchesQuery && matchesPriority && matchesStatus;
    });
  }, [priorityFilter, query, rows, statusFilter]);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(statuses.map(status => [status, [] as Task[]])) as Record<TaskStatus, Task[]>;
    for (const row of filteredRows) map[row.status].push(row);
    return map;
  }, [filteredRows]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    const due = String(form.get('due_at') ?? '');
    const contactId = String(form.get('related_contact_id') ?? '');
    const body = {
      title: String(form.get('title') ?? ''),
      description: String(form.get('description') ?? '').trim() || null,
      priority: form.get('priority'),
      due_at: due ? new Date(due).toISOString() : null,
      related_contact_id: contactId || null
    };
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    setSaving(false);
    if (response.ok) {
      setOpen(false);
      setNotice('Tarefa criada e adicionada à agenda da equipe.');
      await load();
    } else {
      setError('Não foi possível criar a tarefa.');
    }
  }

  async function status(id: string, value: TaskStatus) {
    setError('');
    setNotice('');
    const response = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: value })
    });
    if (!response.ok) setError('Sem permissão para alterar esta tarefa.');
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta tarefa?')) return;
    const response = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (!response.ok) setError('Sem permissão para excluir esta tarefa.');
    await load();
  }

  return <div className={`content ${styles.page}`}>
    <div className={styles.hero}>
      <div>
        <h1 className="page-title">Tarefas</h1>
        <p className="page-sub">Agenda operacional para follow-ups, retornos e atividades comerciais.</p>
      </div>
      <div className={styles.heroActions}>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(value => !value)}>{open ? <X size={17}/> : <Plus size={17}/>} {open ? 'Fechar' : 'Nova tarefa'}</button>
      </div>
    </div>

    <section className={styles.kpiGrid} aria-label="Resumo de tarefas">
      <article className={styles.kpi}><span className={styles.kpiIcon}><ListChecks size={18}/></span><span>Total</span><strong>{summary.total}</strong><small>tarefas registradas</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconBlue}`}><Clock3 size={18}/></span><span>Em aberto</span><strong>{summary.open}</strong><small>pendentes ou em andamento</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconAmber}`}><Siren size={18}/></span><span>Vencidas</span><strong>{summary.overdue}</strong><small>precisam de ação</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconRose}`}><CheckCircle2 size={18}/></span><span>Concluídas</span><strong>{summary.done}</strong><small>finalizadas pela equipe</small></article>
    </section>

    <section className={styles.toolbar} aria-label="Filtros de tarefas">
      <label className={styles.searchField}><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar tarefa, contato ou descrição"/></label>
      <label className={styles.selectField}><Filter size={16}/><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as 'all' | TaskStatus)}><option value="all">Todos os status</option>{statuses.map(value => <option key={value} value={value}>{statusLabel[value]}</option>)}</select></label>
      <label className={styles.selectField}><Siren size={16}/><select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value as 'all' | Priority)}><option value="all">Todas as prioridades</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></label>
    </section>

    {error && <div className="error">{error}</div>}
    {notice && <div className="success">{notice}</div>}

    {open && <form className={styles.formPanel} onSubmit={create}>
      <div><h3>Nova tarefa</h3><p className={styles.sideHint}>Crie uma ação com prazo, prioridade e contato vinculado.</p></div>
      <div className={styles.formGrid}>
        <div className="field"><label>Tarefa</label><input className="input" name="title" required/></div>
        <div className="field"><label>Contato relacionado</label><select className="select" name="related_contact_id" defaultValue=""><option value="">Sem contato</option>{contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></div>
        <div className="field"><label>Prioridade</label><select className="select" name="priority" defaultValue="medium"><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></div>
        <div className="field"><label>Prazo</label><input className="input" name="due_at" type="datetime-local"/></div>
        <div className={`field ${styles.formWide}`}><label>Descrição</label><textarea className="textarea" name="description" rows={3} placeholder="Contexto do retorno, combinação feita ou objetivo da atividade."/></div>
      </div>
      <div className={styles.formFooter}><button className="btn btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar tarefa'}</button></div>
    </form>}

    <section className={styles.taskBoard} aria-label="Quadro de tarefas">
      {statuses.map(lane => <div className={styles.taskLane} key={lane}>
        <div className={styles.taskLaneHead}><div>{statusLabel[lane]}<small>{statusSubtitle[lane]}</small></div><span className="badge">{grouped[lane].length}</span></div>
        {grouped[lane].length ? grouped[lane].map(task => <article className={`${styles.taskCard} ${isOverdue(task) ? styles.taskCardOverdue : ''}`} key={task.id}>
          <div className={styles.taskTitle}>
            <strong>{task.title}</strong>
            <button type="button" className="btn btn-danger icon-btn mini-btn" onClick={() => void remove(task.id)} title="Excluir" aria-label="Excluir tarefa"><Trash2 size={14}/></button>
          </div>
          {task.description && <p className={styles.recordNote}>{task.description}</p>}
          <div className={styles.inlineActions}>
            <span className={`${styles.statusBadge} ${statusClass[task.status]}`}>{statusLabel[task.status]}</span>
            <span className={`${styles.priorityBadge} ${priorityClass[task.priority]}`}>{priorityLabel[task.priority]}</span>
          </div>
          <div className={styles.metaList}>
            <div className={styles.metaLine}><CalendarClock size={15}/><span>{dueLabel(task.due_at)}{isOverdue(task) ? ' · vencida' : ''}</span></div>
            <div className={styles.metaLine}><ContactRound size={15}/><span>{task.contact?.name || 'Sem contato vinculado'}</span></div>
          </div>
          <select className="select compact-select" value={task.status} onChange={event => void status(task.id, event.target.value as TaskStatus)} aria-label="Alterar status da tarefa">
            {statuses.map(value => <option key={value} value={value}>{statusLabel[value]}</option>)}
          </select>
        </article>) : <div className={styles.emptyState}>Nenhuma tarefa aqui.</div>}
      </div>)}
    </section>
  </div>;
}
