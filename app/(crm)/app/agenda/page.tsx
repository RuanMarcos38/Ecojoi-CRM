'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Clock3, ContactRound, Link2, Plus, Siren } from 'lucide-react';
import styles from '../commercial.module.css';

type BookingPage = {
  id:string;
  name:string;
  slug:string;
  duration_minutes:number;
  timezone:string;
  active:boolean;
  owner?:{id:string;full_name:string}|null;
};

type Member = { id:string; full_name:string; active:boolean };

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
  const [bookingPages, setBookingPages] = useState<BookingPage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [notice,setNotice]=useState('');
  const [error, setError] = useState('');

  async function load(){
    const [tr,br,mr]=await Promise.all([
      fetch('/api/tasks',{cache:'no-store'}),
      fetch('/api/booking-pages',{cache:'no-store'}),
      fetch('/api/team',{cache:'no-store'})
    ]);
    const [td,bd,md]=await Promise.all([tr.json(),br.ok?br.json():Promise.resolve(null),mr.ok?mr.json():Promise.resolve(null)]);
    if(tr.ok)setTasks(td.data??[]);else setError('Agenda indisponível para este usuário.');
    if(br.ok)setBookingPages(bd?.data??[]);
    if(mr.ok)setMembers((md?.data??[]).filter((m:Member)=>m.active));
  }
  useEffect(()=>{void load();},[]);

  async function createBookingPage(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');setNotice('');
    const form=new FormData(event.currentTarget);
    const response=await fetch('/api/booking-pages',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        name:form.get('name'),
        owner_id:String(form.get('owner_id')||'')||null,
        duration_minutes:Number(form.get('duration_minutes')||30),
        timezone:'America/Sao_Paulo',
        day_start:String(form.get('day_start')||'09:00'),
        day_end:String(form.get('day_end')||'18:00'),
        interval_minutes:Number(form.get('interval_minutes')||30),
        buffer_minutes:0,
        calendar_webhook_url:String(form.get('calendar_webhook_url')||'')||null,
        confirmation_message:'Agendamento confirmado. Em breve você receberá os detalhes.'
      })
    });
    if(response.ok){setShowBookingForm(false);setNotice('Link público de agendamento criado.');event.currentTarget.reset();await load();}
    else setError('Não foi possível criar a página de agendamento.');
  }

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
      <button className="btn btn-primary" onClick={()=>setShowBookingForm(v=>!v)}><Plus size={15}/>{showBookingForm?'Fechar':'Link de agendamento'}</button>
    </div>

    {notice&&<div className="success">{notice}</div>}
    {showBookingForm&&<form className={styles.formPanel} onSubmit={createBookingPage}>
      <h3>Novo link público de agendamento</h3>
      <div className={styles.formGrid}>
        <div className="field"><label>Nome</label><input className="input" name="name" required placeholder="Reunião comercial"/></div>
        <div className="field"><label>Responsável</label><select className="select" name="owner_id" defaultValue=""><option value="">Usuário atual</option>{members.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select></div>
        <div className="field"><label>Duração (min)</label><input className="input" name="duration_minutes" type="number" min="5" max="480" defaultValue="30"/></div>
        <div className="field"><label>Intervalo (min)</label><input className="input" name="interval_minutes" type="number" min="5" max="240" defaultValue="30"/></div>
        <div className="field"><label>Início do dia</label><input className="input" name="day_start" type="time" defaultValue="09:00"/></div>
        <div className="field"><label>Fim do dia</label><input className="input" name="day_end" type="time" defaultValue="18:00"/></div>
        <div className="field"><label>Webhook calendário/n8n (opcional)</label><input className="input" name="calendar_webhook_url" type="url" placeholder="https://..."/></div>
      </div>
      <button className="btn btn-primary" style={{marginTop:10}}>Criar link</button>
    </form>}

    {bookingPages.length>0&&<section className={styles.formPanel}>
      <h3>Links públicos de agendamento</h3>
      <div className={styles.timelineList}>{bookingPages.map(page=><div className={styles.timelineItem} key={page.id}><div className={styles.timelineTop}><strong>{page.name}</strong><span>{page.duration_minutes} min</span></div><div className={styles.metaLine}><Link2 size={14}/><a href={'/agendar/'+page.slug} target="_blank" rel="noreferrer">{typeof window!=='undefined'?window.location.origin:''}/agendar/{page.slug}</a></div></div>)}</div>
    </section>}

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
