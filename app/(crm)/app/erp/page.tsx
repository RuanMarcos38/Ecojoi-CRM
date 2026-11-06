import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { hasPermission } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/admin';

const count = new Intl.NumberFormat('pt-BR');

export default async function ErpDashboard() {
  const ctx = await requirePermission('erp.stock.view').catch(error => {
    if (error instanceof Response && [401, 403].includes(error.status)) redirect('/app');
    throw error;
  });

  const admin = createAdminClient();
  const canViewPurchases = hasPermission(ctx.role, 'erp.purchases.view');
  const canViewFinance = hasPermission(ctx.role, 'finance.view');
  const [products, suppliers, drafts, approved, received] = await Promise.all([
    admin.from('products').select('id', { head: true, count: 'exact' }).eq('tenant_id', ctx.tenantId).eq('active', true),
    canViewPurchases ? admin.from('erp_suppliers').select('id', { head: true, count: 'exact' }).eq('tenant_id', ctx.tenantId).eq('active', true) : null,
    canViewPurchases ? admin.from('erp_purchase_orders').select('id', { head: true, count: 'exact' }).eq('tenant_id', ctx.tenantId).eq('status', 'draft') : null,
    canViewPurchases ? admin.from('erp_purchase_orders').select('id', { head: true, count: 'exact' }).eq('tenant_id', ctx.tenantId).eq('status', 'approved') : null,
    canViewPurchases ? admin.from('erp_purchase_orders').select('id', { head: true, count: 'exact' }).eq('tenant_id', ctx.tenantId).eq('status', 'received') : null
  ]);

  const cards = [
    { label: 'Produtos ativos', value: products, detail: 'Itens ativos do catálogo' },
    ...(canViewPurchases ? [
      { label: 'Fornecedores ativos', value: suppliers, detail: 'Fornecedores cadastrados' },
      { label: 'Pedidos em rascunho', value: drafts, detail: 'Aguardando aprovação' },
      { label: 'Pedidos aprovados', value: approved, detail: 'Aguardando recebimento total ou parcial' },
      { label: 'Pedidos recebidos', value: received, detail: 'Recebimento integral registrado' }
    ] : [])
  ];

  return <div className="content">
    <h1 className="page-title">ERP · Dashboard</h1>
    <p className="page-sub">Visão operacional da empresa para acompanhar catálogo, compras e recebimentos.</p>

    <section aria-label="Indicadores do ERP" className="grid" style={{
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))'
    }}>
      {cards.map(({ label, value, detail }) => <article className="card stat" key={label}>
        <h2 className="stat-label">{label}</h2>
        <div className="stat-value">{value?.error || value?.count == null ? '—' : count.format(value.count)}</div>
        <p className="muted">{value?.error || value?.count == null ? 'Consulta indisponível' : detail}</p>
      </article>)}
    </section>

    <section className="card section" aria-labelledby="erp-actions">
      <h2 id="erp-actions">Acessos operacionais</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Link href="/app/erp/estoque" className="btn btn-secondary">Consultar estoque</Link>
        {canViewPurchases && <Link href="/app/erp/compras" className="btn btn-secondary">Gerenciar compras</Link>}
        {canViewFinance && <Link href="/app/financeiro" className="btn btn-secondary">Acessar Financeiro</Link>}
      </div>
    </section>
  </div>;
}
