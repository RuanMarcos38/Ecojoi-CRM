'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type Product = { id: string; name: string; sku?: string };
type Movement = { id: string; delta_milli: number; balance_milli: number; reason: string; created_at: string };
type Stock = { data: Movement[]; balance_milli: number };

const quantity = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

export default function StockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [stock, setStock] = useState<Stock | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ payload: string; id: string } | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/products', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) setProducts(result.data);
      })
      .catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar o catálogo.'); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    fetch(`/api/erp/stock?product_id=${encodeURIComponent(productId)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) setStock(result);
      })
      .catch(() => { if (!controller.signal.aborted) setError('Não foi possível consultar o estoque.'); });
    return () => controller.abort();
  }, [productId, refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !stock) return;

    const form = event.currentTarget;
    const values = new FormData(form);
    const match = /^(\d{1,9})(?:[.,](\d{1,3}))?$/.exec(String(values.get('quantity')).trim());
    const milli = match ? Number(match[1]) * 1000 + Number((match[2] ?? '').padEnd(3, '0')) : 0;
    setNotice('');
    if (milli === 0) {
      setError('Informe uma quantidade positiva com até três casas decimais.');
      return;
    }

    const input = {
      product_id: productId,
      delta_milli: values.get('direction') === 'out' ? -milli : milli,
      reason: String(values.get('reason')).trim()
    };
    const payload = JSON.stringify(input);
    if (pending.current?.payload !== payload) pending.current = { payload, id: crypto.randomUUID() };
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/erp/stock', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...input, id: pending.current.id })
      });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error || 'Não foi possível registrar o movimento.');
        return;
      }
      pending.current = null;
      form.reset();
      setNotice('Movimento registrado.');
      setStock(null);
      setRefresh(current => current + 1);
    } catch {
      setError('Falha de comunicação. Para repetir, envie os mesmos dados.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <div className="content">
    <h1 className="page-title">ERP · Estoque</h1>
    <p className="page-sub">Consulte saldos e registre entradas e saídas dos produtos do catálogo.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="success" role="status">{notice}</p>}
    <section className="card section">
      <label className="field">Produto
        <select className="select" value={productId} disabled={busy} onChange={event => {
          setProductId(event.target.value);
          setStock(null);
          setError('');
          setNotice('');
        }}>
          <option value="">Selecione um produto</option>
          {products.map(product => <option key={product.id} value={product.id}>
            {product.name}{product.sku ? ` · ${product.sku}` : ''}
          </option>)}
        </select>
      </label>
      {stock && <>
        <p>Saldo disponível <strong>{quantity.format(stock.balance_milli / 1000)}</strong></p>
        <form className="form-grid" onSubmit={event => void submit(event)} key={productId}>
          <label className="field">Movimento<select name="direction" className="select">
            <option value="in">Entrada</option><option value="out">Saída</option>
          </select></label>
          <label className="field">Quantidade<input name="quantity" className="input" inputMode="decimal" required/></label>
          <label className="field">Motivo<input name="reason" className="input" required minLength={2} maxLength={160}/></label>
          <div><button className="btn btn-primary" disabled={busy}>Registrar movimento</button></div>
        </form>
      </>}
    </section>
    {stock && <section className="card section">
      <h2>Últimos movimentos</h2>
      {stock.data.length ? <div className="table-wrap"><table className="table">
        <thead><tr><th>Data</th><th>Motivo</th><th>Movimento</th><th>Saldo</th></tr></thead>
        <tbody>{stock.data.map(row => <tr key={row.id}>
          <td>{new Date(row.created_at).toLocaleString('pt-BR')}</td><td>{row.reason}</td>
          <td>{quantity.format(row.delta_milli / 1000)}</td><td>{quantity.format(row.balance_milli / 1000)}</td>
        </tr>)}</tbody>
      </table></div> : <p>Sem movimentos para este produto.</p>}
    </section>}
  </div>;
}
