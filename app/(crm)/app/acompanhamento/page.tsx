'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock3, MessageCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from '../commercial.module.css';

type PendingConversation = {
  id: string;
  channel: string;
  contact: { name: string; phone: string | null } | null;
  assignee: { full_name: string } | null;
  last: { id: string; body: string | null; message_type: string | null; attachment_name: string | null; created_at: string };
};

type Attendant = { id: string; full_name: string };

function waitLabel(receivedAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(receivedAt)) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return [days && `${days}d`, hours && `${hours}h`, `${minutes % 60}min`].filter(Boolean).join(' ');
}

function messageLabel(message: PendingConversation['last']) {
  if (message.message_type === 'audio') return 'Mensagem de voz';
  if (message.message_type === 'image') return message.body?.trim() || 'Imagem';
  return message.body?.trim() || message.attachment_name || 'Mensagem';
}

export default function Acompanhamento() {
  const [scope, setScope] = useState('mine');
  const [team, setTeam] = useState<Attendant[] | null>(null);
  const [rows, setRows] = useState<PendingConversation[] | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const supabase = createClient();
    const controller = new AbortController();
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let loading = false;
    let refreshPending = false;
    let changeVersion = 0;

    function refreshAfterChange() {
      changeVersion++;
      void refresh();
    }

    function onMessageChange(change: { new: Record<string, unknown> }) {
      const { conversation_id, created_at, direction, status, id } = change.new;
      const messageTime = Date.parse(String(created_at));
      const clearsPending = direction === 'outbound' && ['sent', 'delivered', 'read'].includes(String(status));
      const restartsWait = direction === 'inbound' && messageTime >= Date.now() - 10 * 60 * 1000;
      if (clearsPending || restartsWait) {
        setRows(current => current?.filter(row => {
          if (row.id !== conversation_id) return true;
          const lastTime = Date.parse(row.last.created_at);
          return !(messageTime > lastTime || (messageTime === lastTime && String(id) > row.last.id));
        }) ?? null);
      }
      refreshAfterChange();
    }

    async function refresh() {
      if (controller.signal.aborted) return;
      if (loading) {
        refreshPending = true;
        return;
      }
      loading = true;
      const requestVersion = changeVersion;
      try {
        const response = await fetch('/api/conversations/follow-up?scope=' + encodeURIComponent(scope), { cache: 'no-store', signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) setRows(null);
          throw new Error('follow_up_fetch_failed');
        }
        const { data, tenantId, canViewTeam, attendants } = await response.json();
        if (controller.signal.aborted) return;
        setTeam(canViewTeam ? attendants : null);
        if (requestVersion === changeVersion) setRows(data);
        setNow(Date.now());
        setError(false);
        if (!channel) {
          channel = supabase.channel(`ecojoi-follow-up-${tenantId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `tenant_id=eq.${tenantId}` }, onMessageChange)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `tenant_id=eq.${tenantId}` }, refreshAfterChange)
            .subscribe(status => { if (status === 'SUBSCRIBED') refreshAfterChange(); });
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        loading = false;
        if (refreshPending) {
          refreshPending = false;
          void refresh();
        }
      }
    }

    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [scope]);

  return <div className={`content ${styles.page}`}>
    <header className={styles.hero}>
      <div>
        <h1>Acompanhamento</h1>
        <p>Clientes aguardando resposta há mais de 10 minutos.</p>
      </div>
      {team && <label className="field">
        <span>Atendente</span>
        <select className="select" value={scope} onChange={event => {
          setRows(null);
          setError(false);
          setScope(event.target.value);
        }}>
          <option value="mine">Meus clientes</option>
          <option value="all">Todos os atendentes</option>
          <option value="unassigned">Sem responsável</option>
          {team.map(attendant => <option key={attendant.id} value={attendant.id}>{attendant.full_name}</option>)}
        </select>
      </label>}
    </header>
    {error && <p role="alert">Não foi possível atualizar o acompanhamento. Tentando novamente.</p>}
    {!error && rows === null && <p role="status">Carregando atendimentos…</p>}
    {rows?.length === 0 && <div className={styles.emptyState}>Nenhum cliente aguardando resposta há mais de 10 minutos.</div>}
    {Boolean(rows?.length) && <section className={`${styles.cardGrid} ${styles.leadGrid}`} aria-label="Clientes sem resposta">
      {rows?.map(row => {
        const name = row.contact?.name || 'Contato';
        return <article className={styles.recordCard} key={row.id}>
          <div className={styles.recordTop}>
            <div className={styles.identityCopy}>
              <strong>{name}</strong>
              <span>{row.contact?.phone || row.channel}</span>
              <span>{row.assignee?.full_name || 'Sem responsável'}</span>
            </div>
            <span className={`${styles.statusBadge} ${styles.priorityMedium}`}>
              <Clock3 size={14} aria-hidden="true"/> {waitLabel(row.last.created_at, now)}
            </span>
          </div>
          <p className={styles.recordNote}>{messageLabel(row.last).slice(0, 180)}</p>
          <div className={styles.cardActions}>
            <Link className="btn btn-primary" href={`/app/atendimento?conversa=${encodeURIComponent(row.id)}`} aria-label={`Responder a ${name}`}>
              <MessageCircle size={15} aria-hidden="true"/> Responder
            </Link>
          </div>
        </article>;
      })}
    </section>}
  </div>;
}
