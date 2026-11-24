'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { notifyDealsChanged, onDealsChanged } from '@/lib/deal-refresh';
import { PipelineDefinition, standardPipeline } from '@/lib/pipelines';

type Deal = { id: string; title: string; stage: string };

export default function ContactDeals({ contactId }: { contactId: string }) {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [pipelines, setPipelines] = useState([standardPipeline]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const locked = useRef(false);
  const revision = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++revision.current;
    const response = await fetch(`/api/deals?contact_id=${encodeURIComponent(contactId)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 403
      ? 'Você não tem permissão para visualizar oportunidades.'
      : 'Não foi possível carregar as oportunidades.');
    const result = await response.json();
    if (request === revision.current) setDeals(result.data ?? []);
  }, [contactId]);

  useEffect(() => {
    const reload = () => void refresh().catch(error => setFeedback(error.message));
    reload();
    let active = true;
    void fetch('/api/pipelines', { cache: 'no-store' }).then(async response => {
      if (!response.ok) return;
      const { data }: { data: PipelineDefinition[] } = await response.json();
      if (active) setPipelines([standardPipeline, ...data]);
    }).catch(() => {});
    const unsubscribe = onDealsChanged(reload);
    const refreshVisible = () => { if (document.visibilityState === 'visible') reload(); };
    const timer = window.setInterval(refreshVisible, 20000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      active = false;
      revision.current++;
      unsubscribe();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [refresh]);

  async function save(url: string, method: 'POST' | 'PATCH', payload: Record<string, unknown>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setFeedback('');
    try {
      const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) {
        setFeedback(response.status === 403 ? 'Você não tem permissão para salvar esta oportunidade.' : 'Não foi possível salvar a oportunidade.');
        return;
      }
      const { data }: { data: Deal } = await response.json();
      revision.current++;
      setDeals(current => method === 'POST' ? [data, ...(current ?? [])] : (current ?? []).map(item => item.id === data.id ? data : item));
      if (method === 'POST') setCreating(false);
      notifyDealsChanged();
      setFeedback(method === 'POST' ? 'Oportunidade criada.' : 'Etapa atualizada.');
    } catch {
      setFeedback('Falha de conexão. Confira o Funil antes de tentar novamente.');
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const title = String(fields.get('title') ?? '').trim();
    if (title.length < 2) {
      setFeedback('Digite um título com pelo menos dois caracteres.');
      return;
    }
    void save('/api/deals', 'POST', { title, stage: fields.get('stage'), contact_id: contactId });
  }

  const stageOptions = pipelines.map(pipeline => (
    <optgroup key={pipeline.id} label={pipeline.name}>
      {pipeline.stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
    </optgroup>
  ));

  return <section aria-label="Oportunidades" style={{ display: 'grid', gap: 8 }}>
    <b>Oportunidades</b>
    {deals?.length === 0 && <p>Nenhuma oportunidade vinculada.</p>}
    {deals?.map(deal => <label key={deal.id} className="field">
      <span>{deal.title}</span>
      <select className="select" aria-label={`Etapa de ${deal.title}`} value={deal.stage} disabled={busy}
        onChange={event => void save(`/api/deals/${deal.id}`, 'PATCH', { stage: event.target.value })}>
        {!pipelines.some(pipeline => pipeline.stages.some(stage => stage.id === deal.stage)) &&
          <option value={deal.stage}>Etapa atual</option>}
        {stageOptions}
      </select>
    </label>)}
    {deals && (creating ? <form onSubmit={create} className="field">
      <label className="field">Título<input className="input" name="title" required minLength={2} maxLength={180}/></label>
      <label className="field">Etapa inicial<select className="select" name="stage" defaultValue="new">{stageOptions}</select></label>
      <button className="btn btn-primary" disabled={busy}>Salvar oportunidade</button>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setCreating(false)}>Cancelar</button>
    </form> : <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setCreating(true)}>Criar oportunidade</button>)}
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}
