'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bot, Clock3, Headset } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Queue = {
  tenantId: string;
  waiting: number;
  human: number;
  automatic: number;
  updatedAt: string;
  oldest: Array<{ id: string; name: string; since: string }>;
};

function waitingTime(since: string, now: string) {
  const minutes = Math.max(0, Math.floor((Date.parse(now) - Date.parse(since)) / 60_000));
  return minutes < 1 ? 'Menos de 1 min' : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export default function AttendanceQueue() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let timer: number | undefined;
    let request: AbortController | undefined;
    let disposed = false;
    let denied = false;

    function schedule() {
      if (timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        void refresh();
      }, 250);
    }

    async function refresh() {
      if (disposed || denied || document.visibilityState !== 'visible') return;
      request?.abort();
      const current = new AbortController();
      request = current;
      try {
        const response = await fetch('/api/dashboard/attendance-queue', { cache: 'no-store', signal: current.signal });
        if (disposed || current.signal.aborted) return;
        if (response.status === 403) {
          denied = true;
          setForbidden(true);
          return;
        }
        if (!response.ok) throw new Error();
        const result: Queue = await response.json();
        if (disposed || current.signal.aborted) return;
        setQueue(result);
        setError('');
        if (!channel) {
          channel = supabase.channel(`dashboard-attendance-${result.tenantId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations',
              filter: `tenant_id=eq.${result.tenantId}` }, schedule).subscribe();
        }
      } catch {
        if (!disposed && !current.signal.aborted) setError('Não foi possível atualizar a fila. Tentando novamente.');
      }
    }

    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 10_000);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      disposed = true;
      request?.abort();
      window.clearInterval(interval);
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', schedule);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  if (forbidden) return null;

  return <section className="approved-panel" aria-label="Fila de atendimento" style={{ marginBlock: 12 }}>
    <div className="approved-panel-head">
      <div><h3>Fila de atendimento</h3>{queue && <p>Atualizado às {new Date(queue.updatedAt).toLocaleTimeString('pt-BR')}</p>}</div>
      <Link href="/app/atendimento" className="btn btn-secondary">Abrir atendimento</Link>
    </div>
    {error && <p role="status">{error}</p>}
    {queue ? <>
      <div className="approved-activity-list">
        <div><span className={queue.waiting ? 'warning' : ''}><Clock3 size={15}/></span><div><b>Esperando</b></div><em>{queue.waiting}</em></div>
        <div><span><Headset size={15}/></span><div><b>Em atendimento</b></div><em>{queue.human}</em></div>
        <div><span><Bot size={15}/></span><div><b>Automático</b></div><em>{queue.automatic}</em></div>
      </div>
      {queue.oldest.length ? <div className="approved-activity-list" style={{ marginTop: 12 }}>
        <h4>Há mais tempo na fila</h4>
        {queue.oldest.map(item => <div key={item.id}><span><Clock3 size={15}/></span>
          <div><Link href={`/app/atendimento?conversa=${encodeURIComponent(item.id)}`}>{item.name}</Link></div>
          <em>{waitingTime(item.since, queue.updatedAt)}</em></div>)}
      </div> : <p>Nenhuma conversa esperando.</p>}
    </> : !error && <p>Carregando fila…</p>}
  </section>;
}
