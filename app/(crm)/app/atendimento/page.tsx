'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Bot, Clock3, Headphones, MoreHorizontal, Plus, Search, Send, UserCheck, X } from 'lucide-react';

type AttendanceState = 'waiting' | 'in_service' | 'automatic';
type Message = { id: string; direction: string; body: string; created_at: string };
type Contact = { id: string; name: string; email?: string; phone?: string };
type Conversation = {
  id: string;
  status: string;
  channel: string;
  assigned_to?: string | null;
  attendance_state: AttendanceState;
  attendance_changed_at?: string;
  updated_at?: string;
  contact: Contact;
  messages: Message[];
};
type Me = { features?: Record<string, boolean> };

const QUEUES: { state: AttendanceState; label: string; Icon: typeof Clock3 }[] = [
  { state: 'waiting', label: 'Esperando', Icon: Clock3 },
  { state: 'in_service', label: 'Atendimento', Icon: Headphones },
  { state: 'automatic', label: 'Automático', Icon: Bot }
];

const STATE_LABEL: Record<AttendanceState, string> = {
  waiting: 'Esperando',
  in_service: 'Atendimento',
  automatic: 'Automático'
};

export default function Atendimento() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [queue, setQueue] = useState<AttendanceState>('waiting');
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [changingState, setChangingState] = useState(false);
  const [error, setError] = useState('');
  const [me, setMe] = useState<Me | null>(null);

  async function load() {
    setLoading(true);
    const [cr, ct, mr] = await Promise.all([
      fetch('/api/conversations', { cache: 'no-store' }),
      fetch('/api/contacts', { cache: 'no-store' }),
      fetch('/api/me', { cache: 'no-store' })
    ]);
    const [cd, td, md] = await Promise.all([cr.json(), ct.json(), mr.ok ? mr.json() : Promise.resolve(null)]);
    if (cr.ok) setItems(cd.data ?? []);
    if (ct.ok) setContacts(td.data ?? []);
    if (mr.ok) setMe(md?.data ?? null);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const queueCounts = useMemo(() => {
    const counts: Record<AttendanceState, number> = { waiting: 0, in_service: 0, automatic: 0 };
    for (const item of items) counts[item.attendance_state ?? 'waiting'] += 1;
    return counts;
  }, [items]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter(item => {
      if ((item.attendance_state ?? 'waiting') !== queue) return false;
      if (!needle) return true;
      const last = item.messages?.[item.messages.length - 1]?.body ?? '';
      return `${item.contact?.name ?? ''} ${item.contact?.email ?? ''} ${item.contact?.phone ?? ''} ${last}`
        .toLowerCase()
        .includes(needle);
    });
  }, [items, queue, search]);

  useEffect(() => {
    if (filtered.some(item => item.id === activeId)) return;
    setActiveId(filtered[0]?.id ?? null);
  }, [filtered, activeId]);

  const active = items.find(item => item.id === activeId) ?? null;
  const aiAgentEnabled = me?.features?.ai_agent === true;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !active || active.attendance_state !== 'in_service') return;
    setError('');
    const r = await fetch(`/api/conversations/${active.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: text })
    });
    const d = await r.json();
    if (r.ok) {
      setText('');
      await load();
      return;
    }
    const errors: Record<string, string> = {
      external_channel_requires_configured_provider: 'Este canal externo ainda não possui provedor configurado.',
      conversation_in_automatic_mode: 'Este contato está sendo atendido pelo agente de IA. Assuma o atendimento antes de responder.',
      conversation_not_in_human_service: 'Assuma o atendimento antes de enviar uma mensagem.'
    };
    setError(errors[d.error] ?? 'Não foi possível enviar a mensagem.');
  }

  async function createConversation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError('');
    const r = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contact_id: fd.get('contact_id'), channel: 'internal' })
    });
    const d = await r.json();
    if (r.ok) {
      setCreating(false);
      setQueue('in_service');
      setActiveId(d.data.id);
      await load();
    } else {
      setError('Você não possui permissão para iniciar este atendimento.');
    }
  }

  async function changeAttendance(state: AttendanceState) {
    if (!active || changingState || active.attendance_state === state) return;
    setChangingState(true);
    setError('');
    try {
      const r = await fetch(`/api/conversations/${active.id}/attendance`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state })
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error === 'attendance_state_update_failed' ? 'Não foi possível alterar a fila deste atendimento.' : 'Você não possui permissão para alterar esta fila.');
        return;
      }
      setQueue(state);
      setActiveId(active.id);
      await load();
    } finally {
      setChangingState(false);
    }
  }

  return (
    <div className="chat-layout attendance-layout">
      <aside className="chat-list">
        <div className="chat-list-head">
          <div>
            <strong>Atendimento</strong>
            <div className="muted" style={{ fontSize: 12 }}>Caixa de entrada unificada</div>
          </div>
          <button className="btn btn-primary icon-btn" onClick={() => setCreating(v => !v)} aria-label="Novo atendimento">
            {creating ? <X size={16} /> : <Plus size={16} />}
          </button>
        </div>

        {creating && (
          <form className="chat-new" onSubmit={createConversation}>
            <select className="select" name="contact_id" required defaultValue="">
              <option value="" disabled>Selecione um contato</option>
              {contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
            </select>
            <button className="btn btn-primary">Iniciar atendimento</button>
          </form>
        )}

        <div className="attendance-search">
          <Search size={15} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conversa..." aria-label="Buscar conversa" />
        </div>

        <div className="attendance-tabs" role="tablist" aria-label="Filas de atendimento">
          {QUEUES.map(({ state, label, Icon }) => (
            <button
              key={state}
              type="button"
              role="tab"
              aria-selected={queue === state}
              className={queue === state ? 'active' : ''}
              onClick={() => setQueue(state)}
            >
              <Icon size={15} />
              <span>{label}</span>
              <b>{queueCounts[state]}</b>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="empty">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhuma conversa em {STATE_LABEL[queue].toLowerCase()}.</div>
        ) : (
          filtered.map(conversation => {
            const lastMessage = conversation.messages?.[conversation.messages.length - 1]?.body ?? 'Sem mensagens';
            return (
              <button
                type="button"
                className={`conversation conversation-button ${activeId === conversation.id ? 'active' : ''}`}
                key={conversation.id}
                onClick={() => setActiveId(conversation.id)}
              >
                <div className="conversation-top">
                  <strong>{conversation.contact?.name ?? 'Contato'}</strong>
                  <small className={`attendance-dot state-${conversation.attendance_state}`} title={STATE_LABEL[conversation.attendance_state]} />
                </div>
                <p>{lastMessage}</p>
                <div className="conversation-meta">
                  <span>{conversation.channel}</span>
                  <span>{STATE_LABEL[conversation.attendance_state]}</span>
                </div>
              </button>
            );
          })
        )}
      </aside>

      <section className="chat-center">
        {active ? (
          <>
            <div className="chat-header attendance-header">
              <div>
                <div className="attendance-title-line">
                  <strong>{active.contact?.name ?? 'Contato'}</strong>
                  <span className={`attendance-badge state-${active.attendance_state}`}>{STATE_LABEL[active.attendance_state]}</span>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {active.contact?.phone ?? active.contact?.email ?? 'Contato CRM'} · {active.channel}
                </div>
              </div>
              <div className="attendance-actions">
                {active.attendance_state !== 'in_service' && (
                  <button className="btn btn-primary" disabled={changingState} onClick={() => void changeAttendance('in_service')}>
                    <UserCheck size={16} />Assumir atendimento
                  </button>
                )}
                {active.attendance_state === 'in_service' && (
                  <>
                    <button className="btn btn-secondary" disabled={changingState} onClick={() => void changeAttendance('waiting')}>
                      <Clock3 size={16} />Esperar
                    </button>
                    <button className="btn btn-secondary" disabled={changingState} onClick={() => void changeAttendance('automatic')}>
                      <Bot size={16} />Agente IA
                    </button>
                  </>
                )}
                {active.attendance_state === 'automatic' && (
                  <button className="btn btn-secondary" disabled={changingState} onClick={() => void changeAttendance('waiting')}>
                    <Clock3 size={16} />Colocar em espera
                  </button>
                )}
                <button className="btn btn-secondary icon-btn" aria-label="Mais opções"><MoreHorizontal size={18} /></button>
              </div>
            </div>

            {active.attendance_state === 'automatic' && (
              <div className={`ai-attendance-banner ${aiAgentEnabled ? 'ready' : 'pending'}`}>
                <Bot size={18} />
                <div>
                  <strong>{aiAgentEnabled ? 'Agente de IA atendendo' : 'Atendimento automático selecionado'}</strong>
                  <span>
                    {aiAgentEnabled
                      ? 'A conversa está reservada ao agente automático. Para responder manualmente, assuma o atendimento.'
                      : 'A fila automática está pronta, mas o recurso Agente de IA ainda precisa ser ativado nas configurações da empresa.'}
                  </span>
                </div>
              </div>
            )}

            {active.attendance_state === 'waiting' && (
              <div className="waiting-attendance-banner">
                <Clock3 size={18} />
                <div><strong>Aguardando atendimento</strong><span>Assuma esta conversa para liberar o envio de mensagens pelo operador.</span></div>
              </div>
            )}

            <div className="chat-messages">
              {active.messages?.length ? (
                active.messages.map(message => (
                  <div key={message.id} className={`msg ${message.direction === 'outbound' ? 'out' : 'in'}`}>{message.body}</div>
                ))
              ) : (
                <div className="empty">Ainda não há mensagens neste atendimento.</div>
              )}
            </div>

            {active.attendance_state === 'in_service' ? (
              <form className="composer" onSubmit={send}>
                <input className="input" value={text} onChange={e => setText(e.target.value)} placeholder="Digite uma mensagem..." />
                <button className="btn btn-primary"><Send size={17} />Enviar</button>
              </form>
            ) : (
              <div className="composer composer-locked">
                {active.attendance_state === 'automatic' ? <Bot size={17} /> : <Clock3 size={17} />}
                <span>{active.attendance_state === 'automatic' ? 'Envio humano bloqueado enquanto o agente automático estiver responsável.' : 'Assuma o atendimento para responder.'}</span>
              </div>
            )}
            {error && <div className="chat-error">{error}</div>}
          </>
        ) : (
          <div className="empty">Selecione uma conversa na fila.</div>
        )}
      </section>

      <aside className="chat-details">
        {active && (
          <>
            <h3>{active.contact?.name}</h3>
            <p className="muted">{active.contact?.email}</p>
            <p className="muted">{active.contact?.phone}</p>
            <hr />
            <strong>Responsável atual</strong>
            <div className="attendance-owner-card">
              {active.attendance_state === 'automatic' ? <Bot size={18} /> : active.attendance_state === 'in_service' ? <Headphones size={18} /> : <Clock3 size={18} />}
              <div><b>{STATE_LABEL[active.attendance_state]}</b><span>{active.attendance_state === 'automatic' ? 'Agente de IA' : active.attendance_state === 'in_service' ? 'Operador humano' : 'Fila aguardando'}</span></div>
            </div>
            <hr />
            <strong>Canal</strong>
            <p className="muted" style={{ fontSize: 13 }}>{active.channel}</p>
            <hr />
            <strong>Segurança</strong>
            <p className="muted" style={{ fontSize: 13 }}>
              Toda leitura, troca de fila e escrita continuam limitadas ao tenant do usuário autenticado. Nenhum dado do MercadoImob ou do CRM R2R é compartilhado com o Ecojoi.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
