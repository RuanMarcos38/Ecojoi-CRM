'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Clock3, ContactRound, Siren } from 'lucide-react';
import styles from '../commercial.module.css';

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at?: string | null;
  contact?: { id: string; name: string } | null;
};

function dayKey(value?: string | null) {
  if (!value) return 'Sem data';
  return new Date(value).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

function hour(value?: string | null) {
  if (!value) return 'A definir';
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function Agenda() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/tasks', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        setTasks(payload.data ?? []);
      })
      .catch(() => setError('Agenda indisponível para este usuário.'));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = dayKey(task.due_at);
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return [...map.entries()];
  }, [tasks]);

  const pending = tasks.filter(task => !['done', 'completed', 'closed', 'cancelled'].includes(task.status));
  const overdue = pending.filter(task => task.due_at && new Date(task.due_at).getTime() < Date.now()).length;

  return <div className={`content ${styles.page}`}>
    <div className={styles.hero}>
      <div>
        <h1 className="page-title">Agenda</h1>
        <p className="page-sub">Reuniões, ligações, visitas, retornos, follow-ups e propostas vinculadas ao CRM.</p>
      </div>
    </div>

    <section className={styles.kpiGrid}>
      <article className={styles.kpi}><span className={styles.kpiIcon}><CalendarClock size={18}/></span><span>Atividades</span><strong>{tasks.length}</strong><small>registradas</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconBlue}`}><Clock3 size={18}/></span><span>Pendentes</span><strong>{pending.length}</strong><small>aguardam execução</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconAmber}`}><Siren size={18}/></span><span>Vencidas</span><strong>{overdue}</strong><small>precisam de ação</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconRose}`}><CheckCircle2 size={18}/></span><span>Concluídas</span><strong>{tasks.filter(task => task.status === 'done').length}</strong><small>finalizadas</small></article>
    </section>

    {error ? <div className="error">{error}</div> : <section className={styles.workspace}>
      <div className={styles.formPanel}>
        <h3>Agenda da equipe</h3>
        {grouped.length ? grouped.map(([day, rows]) => <div className={styles.timelineList} key={day}>
          <div className={styles.timelineTop}><strong>{day}</strong><span className="badge">{rows.length}</span></div>
          {rows.map(task => <article className={styles.timelineItem} key={task.id}>
            <div className={styles.timelineTop}><strong>{hour(task.due_at)}</strong><span>{task.priority}</span></div>
            <p className={styles.recordNote}>{task.title}</p>
            <div className={styles.metaLine}><ContactRound size={15}/><span>{task.contact?.name ?? 'Sem contato vinculado'}</span></div>
          </article>)}
        </div>) : <div className={styles.emptyState}>Nenhuma atividade agendada.</div>}
      </div>
      <aside className={styles.sidePanel}>
        <h3>Ritmo operacional</h3>
        <p className={styles.sideHint}>Use tarefas com prazo para retornos, visitas, propostas e follow-ups. A mesma base alimenta alertas de SLA e relatórios.</p>
        <div className={styles.sideMetric}><span>Próximas 24h</span><strong>{pending.filter(task => task.due_at && new Date(task.due_at).getTime() <= Date.now() + 86400000).length}</strong></div>
        <div className={styles.sideMetric}><span>Alta prioridade</span><strong>{pending.filter(task => task.priority === 'high').length}</strong></div>
      </aside>
    </section>}
  </div>;
}
