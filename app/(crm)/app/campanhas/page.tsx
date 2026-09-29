'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Megaphone, Target, TrendingUp, UserPlus, WalletCards } from 'lucide-react';
import styles from '../commercial.module.css';

type Contact = { id: string; source?: string | null; status: string; created_at?: string };
type Deal = { id: string; stage: string; value: number; contact?: { id: string; source?: string | null } | null };

function money(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Campanhas() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/contacts', { cache: 'no-store' }),
      fetch('/api/deals', { cache: 'no-store' })
    ])
      .then(async ([contactsResponse, dealsResponse]) => {
        const [contactsPayload, dealsPayload] = await Promise.all([contactsResponse.json(), dealsResponse.json()]);
        if (!contactsResponse.ok || !dealsResponse.ok) throw new Error('campaigns_fetch_failed');
        setContacts(contactsPayload.data ?? []);
        setDeals(dealsPayload.data ?? []);
      })
      .catch(() => setError('Não foi possível carregar dados de campanhas.'));
  }, []);

  const rows = useMemo(() => {
    const sources = new Map<string, { leads: number; active: number; deals: number; revenue: number }>();
    for (const contact of contacts) {
      const source = contact.source?.trim() || 'Não informado';
      const row = sources.get(source) ?? { leads: 0, active: 0, deals: 0, revenue: 0 };
      row.leads += contact.status === 'lead' ? 1 : 0;
      row.active += contact.status === 'active' ? 1 : 0;
      sources.set(source, row);
    }
    for (const deal of deals) {
      const source = deal.contact?.source?.trim() || 'Não informado';
      const row = sources.get(source) ?? { leads: 0, active: 0, deals: 0, revenue: 0 };
      row.deals += 1;
      if (deal.stage === 'won') row.revenue += Number(deal.value || 0);
      sources.set(source, row);
    }
    return [...sources.entries()].map(([source, row]) => ({ source, ...row })).sort((a, b) => b.leads + b.deals - (a.leads + a.deals));
  }, [contacts, deals]);

  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalLeads = rows.reduce((sum, row) => sum + row.leads, 0);

  return <div className={`content ${styles.page}`}>
    <div className={styles.hero}>
      <div>
        <h1 className="page-title">Campanhas</h1>
        <p className="page-sub">Atribuição comercial do caminho campanha, atendimento, oportunidade, venda e receita.</p>
      </div>
    </div>

    <section className={styles.kpiGrid}>
      <article className={styles.kpi}><span className={styles.kpiIcon}><Megaphone size={18}/></span><span>Origens</span><strong>{rows.length}</strong><small>canais rastreados</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconBlue}`}><UserPlus size={18}/></span><span>Leads</span><strong>{totalLeads}</strong><small>por fonte declarada</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconAmber}`}><Target size={18}/></span><span>Oportunidades</span><strong>{deals.length}</strong><small>no pipeline</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconRose}`}><WalletCards size={18}/></span><span>Receita</span><strong>{money(totalRevenue)}</strong><small>fechado ganho</small></article>
    </section>

    {error ? <div className="error">{error}</div> : <section className={styles.workspace}>
      <div className={styles.tableShell}>
        <table className="table">
          <thead><tr><th>Origem/Campanha</th><th>Leads</th><th>Clientes ativos</th><th>Oportunidades</th><th>Receita</th><th>Conversão</th></tr></thead>
          <tbody>
            {rows.length ? rows.map(row => <tr key={row.source}>
              <td><strong>{row.source}</strong></td>
              <td>{row.leads}</td>
              <td>{row.active}</td>
              <td>{row.deals}</td>
              <td>{money(row.revenue)}</td>
              <td>{row.leads ? `${Math.round((row.deals / row.leads) * 100)}%` : '-'}</td>
            </tr>) : <tr><td colSpan={6}>Sem dados de campanha ainda.</td></tr>}
          </tbody>
        </table>
      </div>
      <aside className={styles.sidePanel}>
        <h3>Atribuição</h3>
        <p className={styles.sideHint}>Os campos de origem, campanha e UTMs devem chegar pelos webhooks de formulários, anúncios e WhatsApp para calcular CPL, CAC e ROAS.</p>
        <div className={styles.sideMetric}><span>Receita atribuída</span><strong>{money(totalRevenue)}</strong></div>
        <div className={styles.sideMetric}><span>Conversão média</span><strong>{totalLeads ? Math.round((deals.length / totalLeads) * 100) : 0}%</strong></div>
        <div className={styles.sourceList}>
          {rows.slice(0, 4).map(row => <div className={styles.sourceItem} key={row.source}>
            <div className={styles.sourceItemTop}><span>{row.source}</span><b>{row.leads + row.deals}</b></div>
            <div className={styles.progressTrack}><i style={{ width: `${Math.min(100, Math.max(8, (row.leads + row.deals) * 12))}%` }}/></div>
          </div>)}
        </div>
      </aside>
    </section>}
    <section className={styles.sidePanel}>
      <h3><BarChart3 size={16}/> Métricas previstas</h3>
      <p className={styles.sideHint}><TrendingUp size={14}/> CPL, CAC e ROAS dependem do investimento importado das plataformas de mídia. A estrutura de atribuição já está separada para receber esses dados.</p>
    </section>
  </div>;
}
