'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  Circle,
  Clock3,
  FileText,
  Filter,
  Grid2X2,
  Kanban,
  List,
  Megaphone,
  MessageCircle,
  MoreVertical,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smile,
  Star,
  Table2,
  UserRound,
  Users,
  Video,
  X,
  Zap
} from 'lucide-react';
import styles from './attendance.module.css';

type AttendanceState = 'waiting' | 'in_service' | 'automatic';
type Message = {
  id: string;
  direction: string;
  body: string;
  status: string;
  message_type?: 'text' | 'image' | 'audio' | 'file' | 'system';
  attachment_name?: string | null;
  created_at: string;
};
type Contact = { id: string; name: string; email?: string; phone?: string; source?: string; status?: string; created_at?: string };
type Conversation = {
  id: string;
  status: string;
  channel: string;
  assigned_to?: string | null;
  attendance_state: AttendanceState;
  updated_at?: string;
  contact: Contact;
  messages: Message[];
};
type Deal = {
  id: string;
  title: string;
  stage: string;
  value: number;
  probability: number;
  stage_changed_at: string;
  contact?: Contact | null;
};
type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at?: string | null;
  contact?: { id: string; name: string } | null;
};
type Me = { fullName?: string; companyName?: string; features?: Record<string, boolean> };
type BoardCard = {
  id: string;
  title: string;
  subtitle: string;
  labels: string[];
  metric: string;
  footer: string;
  tone: 'blue' | 'green' | 'amber' | 'rose' | 'violet';
  conversationId?: string;
};

const stateLabel: Record<AttendanceState, string> = {
  waiting: 'Aguardando atendimento',
  in_service: 'Em atendimento',
  automatic: 'Automação ativa'
};

const stageLabel: Record<string, string> = {
  new: 'Lead novo',
  qualification: 'Qualificação',
  proposal: 'Proposta',
  closing: 'Negociação',
  won: 'Fechado ganho',
  lost: 'Fechado perdido'
};

const fallbackCards: BoardCard[] = [
  {
    id: 'scope-1',
    title: 'Lead novo de Google Ads',
    subtitle: 'Capturar UTM, campanha, palavra-chave e telefone sem duplicar o cliente.',
    labels: ['Google Ads', 'Lead'],
    metric: 'SLA 5 min',
    footer: 'Entrada em tempo real',
    tone: 'blue'
  },
  {
    id: 'scope-2',
    title: 'Qualificar interesse pelo WhatsApp',
    subtitle: 'Produto, cidade, orçamento, prazo, urgência e motivo de desqualificação.',
    labels: ['WhatsApp', 'Score'],
    metric: 'Quente',
    footer: 'Próxima ação sugerida',
    tone: 'green'
  },
  {
    id: 'scope-3',
    title: 'Follow-up automático',
    subtitle: 'Criar tarefa, enviar template e escalar quando o SLA estiver vencido.',
    labels: ['Automação', 'SLA'],
    metric: '48h',
    footer: 'Regra por campanha',
    tone: 'amber'
  }
];

function initials(name = 'Lead') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
}

function formatTime(value?: string) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function money(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function lastMessage(conversation: Conversation) {
  return conversation.messages?.[conversation.messages.length - 1];
}

async function readApi<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.data ?? null;
  } catch {
    return null;
  }
}

export default function Atendimento() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [conversationPayload, contactPayload, dealPayload, taskPayload, mePayload] = await Promise.all([
        readApi<Conversation[]>('/api/conversations'),
        readApi<Contact[]>('/api/contacts'),
        readApi<Deal[]>('/api/deals'),
        readApi<Task[]>('/api/tasks'),
        readApi<Me>('/api/me')
      ]);
      setConversations(conversationPayload ?? []);
      setContacts(contactPayload ?? []);
      setDeals(dealPayload ?? []);
      setTasks(taskPayload ?? []);
      setMe(mePayload);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filteredConversations = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter(item => {
      const message = lastMessage(item)?.body ?? '';
      return [item.contact?.name, item.contact?.phone, item.contact?.email, item.channel, message].filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [conversations, query]);

  useEffect(() => {
    if (activeId && conversations.some(item => item.id === activeId)) return;
    setActiveId(filteredConversations[0]?.id ?? null);
  }, [activeId, conversations, filteredConversations]);

  const active = conversations.find(item => item.id === activeId) ?? null;
  const board = useMemo(() => {
    const waitingCards: BoardCard[] = filteredConversations
      .filter(item => item.attendance_state === 'waiting')
      .slice(0, 8)
      .map(item => ({
        id: `conv-${item.id}`,
        title: item.contact?.name ?? 'Lead sem nome',
        subtitle: lastMessage(item)?.body || 'Lead novo aguardando primeiro atendimento humano.',
        labels: [item.channel, 'novo'],
        metric: item.updated_at ? formatTime(item.updated_at) : 'agora',
        footer: item.contact?.phone ?? item.contact?.email ?? 'Sem telefone',
        tone: 'rose',
        conversationId: item.id
      }));
    const serviceCards: BoardCard[] = filteredConversations
      .filter(item => item.attendance_state === 'in_service')
      .slice(0, 8)
      .map(item => ({
        id: `service-${item.id}`,
        title: item.contact?.name ?? 'Contato em atendimento',
        subtitle: lastMessage(item)?.body || 'Conversa ativa com registro completo no CRM.',
        labels: [item.channel, 'humano'],
        metric: stateLabel[item.attendance_state],
        footer: item.messages?.length ? `${item.messages.length} mensagens` : 'Sem histórico',
        tone: 'green',
        conversationId: item.id
      }));
    const dealCards: BoardCard[] = deals
      .filter(item => !['lost'].includes(item.stage))
      .slice(0, 8)
      .map(item => ({
        id: `deal-${item.id}`,
        title: item.title,
        subtitle: item.contact?.name ? `Contato: ${item.contact.name}` : 'Oportunidade aguardando contato vinculado.',
        labels: [stageLabel[item.stage] ?? item.stage, `${item.probability}%`],
        metric: money(item.value),
        footer: item.stage_changed_at ? `${stageLabel[item.stage] ?? item.stage} desde ${new Date(item.stage_changed_at).toLocaleDateString('pt-BR')}` : 'Pipeline',
        tone: item.stage === 'won' ? 'green' : item.stage === 'proposal' ? 'amber' : 'blue'
      }));
    return {
      waiting: waitingCards.length ? waitingCards : fallbackCards.slice(0, 1),
      progress: serviceCards.length ? serviceCards : fallbackCards.slice(1, 2),
      complete: dealCards.length ? dealCards : fallbackCards.slice(2)
    };
  }, [deals, filteredConversations]);

  const metrics = useMemo(() => {
    const openDeals = deals.filter(deal => !['won', 'lost'].includes(deal.stage));
    return {
      leadsToday: contacts.filter(contact => {
        if (!contact.created_at) return false;
        return contact.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10);
      }).length,
      waiting: conversations.filter(item => item.attendance_state === 'waiting').length,
      service: conversations.filter(item => item.attendance_state === 'in_service').length,
      revenue: deals.filter(deal => deal.stage === 'won').reduce((sum, deal) => sum + Number(deal.value || 0), 0),
      openPipeline: openDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0),
      tasks: tasks.filter(task => !['done', 'completed', 'closed'].includes(task.status)).length
    };
  }, [contacts, conversations, deals, tasks]);

  async function changeAttendance(state: AttendanceState) {
    if (!active || active.attendance_state === state) return;
    setError('');
    setNotice('');
    const response = await fetch(`/api/conversations/${active.id}/attendance`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state })
    });
    if (!response.ok) {
      setError('Não foi possível alterar o responsável desta conversa.');
      return;
    }
    setNotice(state === 'in_service' ? 'Atendimento assumido.' : 'Fila atualizada.');
    await load();
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!active || !text.trim()) return;
    setSaving(true);
    setError('');
    setNotice('');
    const response = await fetch(`/api/conversations/${active.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: text.trim() })
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setError(payload?.error === 'conversation_not_in_human_service' ? 'Assuma o atendimento antes de responder.' : 'Não foi possível enviar a mensagem.');
      return;
    }
    setText('');
    setNotice(payload?.delivery === 'queued' ? 'Mensagem enfileirada para o provedor oficial.' : 'Mensagem registrada no atendimento.');
    await load();
  }

  const demoMessages: Message[] = [
    { id: 'demo-1', direction: 'inbound', body: 'Olá, vi o anúncio e gostaria de entender as opções disponíveis.', status: 'sent', created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString() },
    { id: 'demo-2', direction: 'outbound', body: 'Perfeito. Vou te ajudar e já registrar sua necessidade para a proposta.', status: 'sent', created_at: new Date(Date.now() - 1000 * 60 * 8).toISOString() }
  ];
  const activeMessages = active?.messages?.length ? active.messages : demoMessages;
  const activeContact = active?.contact ?? contacts[0] ?? { id: 'demo', name: 'Lead Ecojoi', phone: '+55 11 90000-0000', email: 'lead@exemplo.com' };
  const canSend = active?.attendance_state === 'in_service';

  return (
    <div className={styles.frame}>
      <aside className={styles.rail} aria-label="Navegação principal">
        <div className={styles.windowDots}><i/><i/><i/></div>
        <div className={styles.logoMark}>C</div>
        <nav className={styles.railNav}>
          <a className={styles.activeRail} href="/app/atendimento" aria-label="Atendimento"><Grid2X2 size={18}/></a>
          <a href="/app/pipeline" aria-label="Pipeline"><Kanban size={18}/></a>
          <a href="/app/tarefas" aria-label="Tarefas"><CheckSquare size={18}/><b>{metrics.tasks}</b></a>
          <a href="/app/relatorios" aria-label="Relatórios"><BarChart3 size={18}/></a>
          <a href="/app/equipe" aria-label="Equipe"><Users size={18}/></a>
          <a href="/app/configuracoes" aria-label="Configurações"><Settings size={18}/></a>
        </nav>
      </aside>

      <aside className={styles.projectPane}>
        <label className={styles.projectSearch}><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search..." /></label>
        <section className={styles.projectGroup}>
          <span>Favorites</span>
          <a><Star size={13}/> Novos leads <b>{metrics.waiting}</b></a>
          <a><Circle size={12}/> Follow-up</a>
          <a><CheckCircle2 size={13}/> Qualificados</a>
          <a><AlertTriangle size={13}/> SLA vencido</a>
        </section>
        <section className={styles.projectGroup}>
          <span>CRM Comercial</span>
          <a className={styles.projectActive}><MessageCircle size={13}/> Atendimento <b>{metrics.service}</b></a>
          <a><UserRound size={13}/> Leads</a>
          <a><Kanban size={13}/> Pipeline</a>
          <a><CalendarClock size={13}/> Agenda</a>
          <a><Megaphone size={13}/> Campanhas</a>
          <a><ShieldCheck size={13}/> Equipe</a>
        </section>
        <section className={styles.projectGroup}>
          <span>Operação</span>
          <a><Zap size={13}/> Automações</a>
          <a><Bot size={13}/> IA nos bastidores</a>
          <a><FileText size={13}/> Relatórios</a>
        </section>
        <button className={styles.newProject}><Plus size={14}/> Novo lead</button>
      </aside>

      <main className={styles.boardPane}>
        <header className={styles.boardHeader}>
          <div>
            <div className={styles.boardTitleRow}><CheckSquare size={18}/><h1>Ecojoi CRM</h1></div>
            <p><span>Google Ads</span><i/> <span>Meta Ads</span><i/> <span>WhatsApp</span></p>
          </div>
          <div className={styles.boardActions}>
            <Search size={18}/><Star size={18}/><MoreVertical size={18}/>
          </div>
        </header>

        <nav className={styles.tabs} aria-label="Áreas do atendimento">
          <a>Discussão <b>{metrics.waiting}</b></a>
          <a className={styles.tabActive}>Tasks</a>
          <a>Timeline</a>
          <a>Arquivos</a>
          <a>Overview</a>
        </nav>

        <section className={styles.viewbar}>
          <div>
            <button className={styles.viewActive}><Kanban size={15}/> Kanban</button>
            <button><Table2 size={15}/> Table</button>
            <button><List size={15}/> List View</button>
          </div>
          <button><Filter size={15}/> Filter</button>
        </section>

        <section className={styles.metricStrip} aria-label="Resumo operacional">
          <article><span>Leads hoje</span><strong>{metrics.leadsToday}</strong></article>
          <article><span>Aguardando</span><strong>{metrics.waiting}</strong></article>
          <article><span>Em atendimento</span><strong>{metrics.service}</strong></article>
          <article><span>Pipeline aberto</span><strong>{money(metrics.openPipeline)}</strong></article>
          <article><span>Receita ganha</span><strong>{money(metrics.revenue)}</strong></article>
        </section>

        <section className={styles.board} aria-label="Kanban comercial">
          {[
            ['waiting', 'Novos Leads', board.waiting],
            ['progress', 'Em Atendimento', board.progress],
            ['complete', 'Pipeline e Receita', board.complete]
          ].map(([key, title, cards]) => (
            <div className={styles.column} key={String(key)}>
              <div className={styles.columnHead}><span><i className={styles[String(key)]}/>{String(title)} <b>{(cards as BoardCard[]).length}</b></span><button><Plus size={16}/></button></div>
              {(cards as BoardCard[]).map(card => (
                <article
                  className={`${styles.taskCard} ${card.conversationId === activeId ? styles.selectedCard : ''}`}
                  key={card.id}
                  onClick={() => card.conversationId && setActiveId(card.conversationId)}
                >
                  <div className={styles.cardTop}>
                    <div>{card.labels.map(label => <span className={`${styles.label} ${styles[card.tone]}`} key={`${card.id}-${label}`}>{label}</span>)}</div>
                    <MoreVertical size={16}/>
                  </div>
                  <h3>{card.title}</h3>
                  <p>{card.subtitle}</p>
                  <div className={styles.cardFooter}>
                    <span>{card.metric}</span>
                    <small>{card.footer}</small>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </section>
      </main>

      <aside className={styles.chatPane}>
        <header className={styles.chatTop}>
          <button aria-label="Fechar"><X size={18}/></button>
          <div><Video size={17}/><Phone size={17}/><MoreVertical size={17}/></div>
        </header>

        <section className={styles.profile}>
          <span className={styles.profileAvatar}>{initials(activeContact.name)}</span>
          <h2>{activeContact.name}</h2>
          <p>{activeContact.phone ?? activeContact.email ?? 'Contato comercial'}</p>
          <div><span>Lead quente</span><span>{active?.channel ?? 'WhatsApp'}</span></div>
        </section>

        <section className={styles.statusPanel}>
          <div><Clock3 size={16}/><span>{active ? stateLabel[active.attendance_state] : 'Visão demonstrativa'}</span></div>
          {active && active.attendance_state !== 'in_service' && <button onClick={() => void changeAttendance('in_service')}>Assumir</button>}
          {active && active.attendance_state === 'in_service' && <button onClick={() => void changeAttendance('waiting')}>Pausar</button>}
        </section>

        <section className={styles.messages}>
          {activeMessages.map(message => (
            <div key={message.id} className={`${styles.message} ${message.direction === 'outbound' ? styles.outbound : styles.inbound}`}>
              <p>{message.message_type === 'file' ? message.attachment_name ?? message.body : message.body}</p>
              <span>{formatTime(message.created_at)} {message.direction === 'outbound' && message.status === 'queued' ? ' · fila' : ''}</span>
            </div>
          ))}
          <div className={styles.meetingCard}><small>Próxima atividade</small><strong>{tasks[0]?.title ?? 'Follow-up comercial'}</strong><span>{tasks[0]?.due_at ? new Date(tasks[0].due_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Hoje, 14:20'}</span></div>
          {(error || notice) && <div className={error ? styles.error : styles.notice}>{error || notice}</div>}
        </section>

        <form className={styles.composer} onSubmit={send}>
          <button type="button" aria-label="Anexar"><Paperclip size={18}/></button>
          <button type="button" aria-label="Emoji"><Smile size={18}/></button>
          <input value={text} onChange={event => setText(event.target.value)} disabled={!canSend || saving} placeholder={canSend ? 'Write a message...' : 'Assuma o atendimento...'} />
          <button aria-label="Enviar" disabled={!canSend || !text.trim() || saving}><Send size={17}/></button>
        </form>
      </aside>

      {loading && <div className={styles.loadingOverlay}>Carregando CRM...</div>}
    </div>
  );
}
