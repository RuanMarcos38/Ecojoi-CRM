'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock3, MessageCircle } from 'lucide-react';
import styles from '../commercial.module.css';

type Card = {
  id: string;
  channel: string;
  name: string;
  assignee: string | null;
  waitingMinutes: number;
};

const channels: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', email: 'E-mail', internal: 'Interno'
};

function waitingTime(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

export default function FollowUpPage() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function refresh() {
      try {
        const response = await fetch('/api/conversations/acompanhamento', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('follow_up_fetch_failed');
        const { data } = await response.json();
        if (controller.signal.aborted) return;
        setCards(data);
        setError(false);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(refresh, 5000);
      }
    }
    void refresh();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, []);

  return <section className={styles.page}>
    <header>
      <h1>Acompanhamento</h1>
      <p>Clientes aguardando resposta há pelo menos 10 minutos.</p>
    </header>
    {error && <p role="alert">Não foi possível atualizar o acompanhamento. Tentando novamente…</p>}
    {!cards && !error && <div className={styles.emptyState}>Carregando atendimentos…</div>}
    {cards?.length === 0 && !error && <div className={styles.emptyState}>Nenhum cliente aguardando resposta.</div>}
    <div className={styles.cardGrid}>
      {cards?.map(card => <article className={styles.recordCard} key={card.id}>
        <div className={styles.recordTop}>
          <div className={styles.identityCopy}>
            <strong>{card.name}</strong>
            <span>{channels[card.channel] ?? card.channel}</span>
            <span>{card.assignee ? `Responsável: ${card.assignee}` : 'Aguardando responsável'}</span>
          </div>
          <span className={styles.statusBadge}><Clock3 size={14}/> {waitingTime(card.waitingMinutes)}</span>
        </div>
        <div className={styles.cardActions}>
          <Link className="btn btn-secondary" href={`/app/atendimento?conversa=${card.id}`}>
            <MessageCircle size={15}/> Abrir atendimento
          </Link>
        </div>
      </article>)}
    </div>
  </section>;
}
