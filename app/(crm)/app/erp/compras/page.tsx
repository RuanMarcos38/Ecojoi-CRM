'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { parseAmountCents } from '@/lib/finance/amount';

type Supplier = { id: string; legal_name: string };
type Product = { id: string; name: string };
type Line = { id: string; product_id: string; quantity_milli: number; received_milli: number; unit_price_cents: number };
type Order = { id: string; supplier_id: string; status: 'draft' | 'approved' | 'received' | 'cancelled'; lines: Line[] };
const statuses = { draft: 'Rascunho', approved: 'Aprovado', received: 'Recebido', cancelled: 'Cancelado' };
const quantity = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function milli(value: FormDataEntryValue | null) {
  const match = /^(\d{1,9})(?:[.,](\d{1,3}))?$/.exec(String(value ?? '').trim());
  return match ? Number(match[1]) * 1000 + Number((match[2] ?? '').padEnd(3, '0')) : 0;
}

export default function PurchasesPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rows, setRows] = useState([0]);
  const nextRow = useRef(1);
  const [receipt, setReceipt] = useState<{ order: Order; line: Line } | null>(null);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal, cache: 'no-store' as const };
    Promise.all([fetch('/api/erp/purchases', options), fetch('/api/products', options)])
      .then(async ([purchases, catalog]) => {
        if (!purchases.ok || !catalog.ok) throw new Error();
        const [data, items] = await Promise.all([purchases.json(), catalog.json()]);
        if (controller.signal.aborted) return;
        setSuppliers(data.suppliers);
        setOrders(data.orders);
        setProducts(items.data);
      })
      .catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar os dados de compras.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  async function save(input: Record<string, unknown>, message: string, form?: HTMLFormElement) {
    if (submitting.current) return;
    const key = JSON.stringify(input);
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    submitting.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/erp/purchases', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...input, id: pending.current.id })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error || 'Não foi possível salvar.');
        return;
      }
      pending.current = null;
      form?.reset();
      if (input.action === 'order_items') setRows([0]);
      if (input.action === 'receive') setReceipt(null);
      setNotice(message);
      setRefresh(current => current + 1);
    } catch {
      setError('Falha de comunicação. Para repetir, envie os mesmos dados.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function registerSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    void save({ action: 'supplier', legal_name: values.get('name'), tax_document: String(values.get('document') ?? '').replace(/\D/g, '') || null }, 'Fornecedor cadastrado.', form);
  }

  function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const items = rows.map(row => ({
      product_id: String(values.get(`product-${row}`) ?? ''),
      quantity_milli: milli(values.get(`quantity-${row}`)),
      unit_price_cents: parseAmountCents(String(values.get(`price-${row}`) ?? ''))
    }));
    if (items.some(item => !item.product_id || !item.quantity_milli || item.unit_price_cents === null)) {
      setError('Informe produto, quantidade positiva e preço válido em cada item.');
      return;
    }
    if (new Set(items.map(item => item.product_id)).size !== items.length) {
      setError('Informe cada produto apenas uma vez e some as quantidades.');
      return;
    }
    void save({ action: 'order_items', supplier_id: values.get('supplier'), items }, 'Pedido criado como rascunho.', form);
  }

  function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receipt) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const quantity_milli = milli(values.get('quantity'));
    if (!quantity_milli) {
      setError('Informe uma quantidade positiva com até três casas decimais.');
      return;
    }
    void save({ action: 'receive', order_id: receipt.order.id, line_id: receipt.line.id, quantity_milli, due_date: values.get('due_date') }, 'Recebimento registrado.', form);
  }

  return <div className="content">
    <h1 className="page-title">ERP · Compras</h1>
    <p className="page-sub">Fornecedores, pedidos e recebimentos vinculados ao estoque e ao Financeiro.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="success" role="status">{notice}</p>}

    <section className="card section" aria-labelledby="purchase-suppliers">
      <h2 id="purchase-suppliers">Fornecedores</h2>
      <form className="form-grid" onSubmit={registerSupplier}>
        <label className="field">Nome do fornecedor<input className="input" name="name" minLength={2} maxLength={160} required/></label>
        <label className="field">CPF ou CNPJ, opcional<input className="input" name="document" maxLength={18}/></label>
        <div><button className="btn btn-primary" disabled={busy}>Cadastrar fornecedor</button></div>
      </form>
    </section>

    <section className="card section" aria-labelledby="new-order">
      <h2 id="new-order">Novo pedido</h2>
      {!loading && (!products.length || !suppliers.length) && <p>Cadastre um fornecedor e um produto antes de criar o pedido.</p>}
      <form className="form-grid" onSubmit={createOrder}>
        <label className="field">Fornecedor<select className="select" name="supplier" defaultValue="" required>
          <option value="">Selecione</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.legal_name}</option>)}
        </select></label>
        {rows.map((row, index) => <fieldset className="form-grid" key={row} style={{ gridColumn: '1 / -1', border: '1px solid var(--line)', borderRadius: 8, minWidth: 0 }}>
          <legend>Item {index + 1}</legend>
          <label className="field">Produto<select className="select" name={`product-${row}`} defaultValue="" required>
            <option value="">Selecione</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
          <label className="field">Quantidade<input className="input" name={`quantity-${row}`} inputMode="decimal" required/></label>
          <label className="field">Preço unitário em reais<input className="input" name={`price-${row}`} inputMode="decimal" required/></label>
          {rows.length > 1 && <div><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setRows(current => current.filter(id => id !== row))}>Remover item {index + 1}</button></div>}
        </fieldset>)}
        <div><button type="button" className="btn btn-secondary" disabled={busy || rows.length >= 50} onClick={() => {
          const row = nextRow.current++;
          setRows(current => [...current, row]);
        }}>Adicionar item</button></div>
        <div><button className="btn btn-primary" disabled={busy || loading || !suppliers.length || !products.length}>Criar pedido</button></div>
      </form>
    </section>

    {receipt && <section className="card section" aria-labelledby="receipt-heading">
      <h2 id="receipt-heading">Registrar recebimento</h2>
      <p>Restante: {quantity.format((receipt.line.quantity_milli - receipt.line.received_milli) / 1000)}</p>
      <form className="form-grid" onSubmit={receive} key={receipt.line.id}>
        <label className="field">Quantidade recebida<input className="input" name="quantity" inputMode="decimal" required/></label>
        <label className="field">Vencimento da conta a pagar<input className="input" name="due_date" type="date" required/></label>
        <div><button className="btn btn-primary" disabled={busy}>Confirmar recebimento</button>{' '}
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setReceipt(null)}>Cancelar</button></div>
      </form>
    </section>}

    <section className="card section" aria-labelledby="purchase-orders">
      <h2 id="purchase-orders">Últimos pedidos</h2>
      {loading ? <p>Carregando pedidos…</p> : orders.length ? <div className="table-wrap"><table className="table">
        <thead><tr><th>Fornecedor</th><th>Produto</th><th>Recebido / pedido</th><th>Preço unitário</th><th>Situação</th><th>Ação</th></tr></thead>
        <tbody>{orders.flatMap(order => order.lines.map(line => <tr key={line.id}>
          <td>{suppliers.find(s => s.id === order.supplier_id)?.legal_name ?? 'Fornecedor'}</td>
          <td>{products.find(p => p.id === line.product_id)?.name ?? 'Produto'}</td>
          <td>{quantity.format(line.received_milli / 1000)} / {quantity.format(line.quantity_milli / 1000)}</td>
          <td>{currency.format(line.unit_price_cents / 100)}</td><td>{statuses[order.status]}</td>
          <td>{order.status === 'draft' && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void save({ action: 'approve', order_id: order.id }, 'Pedido aprovado.')}>Aprovar pedido</button>}
          {order.status === 'approved' && line.received_milli < line.quantity_milli && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setReceipt({ order, line })}>Receber item</button>}</td>
        </tr>))}</tbody>
      </table></div> : <p>Nenhum pedido cadastrado.</p>}
    </section>
  </div>;
}
