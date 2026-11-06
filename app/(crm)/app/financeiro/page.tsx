'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { parseAmountCents } from '@/lib/finance/amount';

type Title = {
  id: string;
  direction: 'payable' | 'receivable';
  description: string;
  due_date: string;
  amount_cents: number;
  settled_cents: number;
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function FinancePage() {
  const [titles, setTitles] = useState<Title[]>([]);
  const [selected, setSelected] = useState<Title | null>(null);
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const operation = useRef<{ fingerprint: string; id: string } | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setTitles([]);
    setHasMore(false);

    async function load() {
      try {
        const response = await fetch(`/api/finance/titles?page=${page}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) {
          setTitles(result.data);
          setHasMore(result.hasMore);
        }
      } catch {
        if (!controller.signal.aborted) setError('Não foi possível carregar os títulos.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [page, refresh]);

  async function submit(event: FormEvent<HTMLFormElement>, title?: Title) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const amount_cents = parseAmountCents(String(values.get('amount') ?? ''));
    setNotice('');
    if (amount_cents === null) {
      setError('Informe um valor positivo com até duas casas decimais, sem separador de milhar.');
      return;
    }
    const input = title
      ? { title_id: title.id, amount_cents }
      : { direction: values.get('direction'), description: String(values.get('description')).trim(), due_date: values.get('due_date'), amount_cents };
    const fingerprint = JSON.stringify(input);
    if (operation.current?.fingerprint !== fingerprint) {
      operation.current = { fingerprint, id: crypto.randomUUID() };
    }
    submitting.current = true;
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/finance/titles', {
        method: title ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...input, id: operation.current.id })
      });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error || 'Não foi possível salvar.');
        return;
      }
      operation.current = null;
      form.reset();
      setSelected(null);
      setNotice(title ? 'Baixa registrada.' : 'Título cadastrado.');
      if (!title) setPage(0);
      setRefresh(current => current + 1);
    } catch {
      setError('Falha de comunicação. Tente novamente com os mesmos dados.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <div className="content">
    <h1 className="page-title">Financeiro</h1>
    <p className="page-sub">Contas a pagar e receber, com baixas manuais parciais e integrais.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status" className="success">{notice}</p>}

    <section className="card section" aria-labelledby="new-title">
      <h2 id="new-title">Novo título</h2>
      <form onSubmit={event => void submit(event)} className="form-grid">
        <label className="field">Tipo
          <select className="select" name="direction">
            <option value="receivable">A receber</option><option value="payable">A pagar</option>
          </select>
        </label>
        <label className="field">Descrição
          <input className="input" name="description" required minLength={2} maxLength={160}/>
        </label>
        <label className="field">Vencimento
          <input className="input" name="due_date" type="date" required/>
        </label>
        <label className="field">Valor em reais
          <input className="input" name="amount" inputMode="decimal" placeholder="0,00" required/>
        </label>
        <div><button className="btn btn-primary" disabled={busy}>Cadastrar título</button></div>
      </form>
    </section>

    {selected && <section className="card section" aria-labelledby="settle-title">
      <h2 id="settle-title">Registrar baixa</h2>
      <p>{selected.description} · Em aberto {money.format((selected.amount_cents - selected.settled_cents) / 100)}</p>
      <form onSubmit={event => void submit(event, selected)} key={selected.id}>
        <label className="field">Valor da baixa em reais
          <input className="input" name="amount" inputMode="decimal" required/>
        </label>
        <button className="btn btn-primary" disabled={busy}>Confirmar baixa</button>{' '}
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setSelected(null)}>Cancelar</button>
      </form>
    </section>}

    <section className="card section" aria-labelledby="titles">
      <h2 id="titles">Títulos</h2>
      {loading ? <p role="status">Carregando títulos…</p> : titles.length ? <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Descrição</th><th>Tipo</th><th>Vencimento</th><th>Valor</th><th>Em aberto</th><th>Ação</th></tr></thead>
          <tbody>{titles.map(title => {
            const balance = title.amount_cents - title.settled_cents;
            return <tr key={title.id}>
              <td>{title.description}</td><td>{title.direction === 'payable' ? 'A pagar' : 'A receber'}</td>
              <td>{title.due_date.split('-').reverse().join('/')}</td><td>{money.format(title.amount_cents / 100)}</td>
              <td>{money.format(balance / 100)}</td>
              <td>{balance > 0 ? <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setSelected(title)}>Dar baixa</button> : 'Quitado'}</td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <p>Nenhum título nesta página.</p>}
      <button type="button" className="btn btn-secondary" disabled={loading || busy || page === 0} onClick={() => setPage(current => current - 1)}>Anterior</button>{' '}
      <button type="button" className="btn btn-secondary" disabled={loading || busy || !hasMore} onClick={() => setPage(current => current + 1)}>Próxima</button>
    </section>
  </div>;
}
