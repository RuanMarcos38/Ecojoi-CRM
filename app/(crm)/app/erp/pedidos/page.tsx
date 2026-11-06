'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Proposal = { id: string; title: string; total: number };
type Order = Proposal & {
  proposal_id: string;
  items: { description: string; quantity: number; unit_price: number; total: number; sort_order: number }[];
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function SalesOrdersPage() {
  const [data, setData] = useState<{ proposals: Proposal[]; orders: Order[] } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/erp/sales', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) setData(result);
      })
      .catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar os pedidos.'); });
    return () => controller.abort();
  }, [refresh]);

  async function convert(proposal: Proposal) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/erp/sales', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposal_id: proposal.id })
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Não foi possível gerar o pedido.');
        return;
      }
      setNotice(result.created ? 'Pedido de venda gerado.' : 'A proposta já possui um pedido de venda.');
      setRefresh(current => current + 1);
    } catch {
      setError('Falha de comunicação. Você pode repetir a operação.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="content">
    <h1 className="page-title">ERP · Pedidos de venda</h1>
    <p className="page-sub">Converta propostas aceitas em pedidos com os itens e preços confirmados.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="success" role="status">{notice}</p>}
    <section className="card section">
      <h2>Propostas aceitas</h2>
      <Link href="/app/vendas" className="btn btn-secondary">Ver operações comerciais</Link>
      {data && (data.proposals.length ? <ul>{data.proposals.map(proposal => <li key={proposal.id}>
        {proposal.title} · {money.format(proposal.total)}{' '}
        <button className="btn btn-secondary" type="button" disabled={busy || data.orders.some(order => order.proposal_id === proposal.id)}
          onClick={() => void convert(proposal)}>Gerar pedido</button>
      </li>)}</ul> : <p>Nenhuma proposta aceita disponível.</p>)}
    </section>
    <section className="card section">
      <h2>Pedidos recentes</h2>
      {data && (data.orders.length ? data.orders.map(order => <details key={order.id}>
        <summary>{order.title} · {money.format(order.total)}</summary>
        <ul>{[...order.items].sort((a,b) => a.sort_order - b.sort_order).map((item, index) => <li key={index}>
          {item.description} · {item.quantity} × {money.format(item.unit_price)} · {money.format(item.total)}
        </li>)}</ul>
      </details>) : <p>Nenhum pedido gerado.</p>)}
    </section>
  </div>;
}
