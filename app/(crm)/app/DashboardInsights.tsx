'use client';

import { useEffect, useState } from 'react';
import styles from './dashboard.module.css';

type Summary = {
  newContacts: number; conversations: number; opportunities: number; wins: number; losses: number;
  winRate: number | null; revenue: number; medianResponse: number | null; responseSample: number;
};
export type Insights = {
  start: string; end: string; previousStart: string; previousEnd: string;
  current: Summary; previous: Summary;
  trends: { day: string; contacts: number; conversations: number; won: number }[];
  channels: { channel: string; entered: number; open: number; waiting: number }[];
  origins: { source: string; contacts: number; wins: number; revenue: number }[];
  risks: { unassigned: number; staleDeals: number; waitingConversations: number; slaBreached: number; overdueTasks: number };
};

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const channelLabels: Record<string,string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', internal: 'Interno', email: 'E-mail', unknown: 'Sem canal' };
const dayLabel = (day: string) => day.split('-').slice(1).reverse().join('/');
const seriesLabels = { contacts: 'Contatos cadastrados', conversations: 'Conversas iniciadas', won: 'Negócios ganhos' } as const;

export function DashboardInsights({ initial }: { initial: Insights }) {
  const [days,setDays] = useState(30);
  const [period,setPeriod] = useState<{ days:number; data:Insights } | null>(null);
  const [error,setError] = useState(false);
  const [series,setSeries] = useState<keyof typeof seriesLabels>('contacts');

  useEffect(() => {
    if (days === 30) return;
    const controller = new AbortController();
    fetch('/api/dashboard?days=' + days, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error();
        const { data } = await response.json();
        if (!data?.insights) throw Error();
        if (!controller.signal.aborted) setPeriod({ days, data: data.insights });
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [days]);

  const data = days === 30 ? initial : period?.days === days ? period.data : null;
  return <section className={styles.insights} aria-label="Indicadores para decisão">
    <header className={styles.insightsHeader}>
      <h2>Indicadores para decisão</h2>
      <label>Período <select className="select" value={days} onChange={event => {
        setError(false); setPeriod(null); setDays(Number(event.target.value));
      }}><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option></select></label>
    </header>
    {error && <p role="alert">Não foi possível carregar este período. Selecione outro intervalo.</p>}
    {!data && !error && <p role="status">Carregando período…</p>}
    {data && <InsightsContent data={data} series={series} setSeries={setSeries}/>}
  </section>;
}

function InsightsContent({data,series,setSeries}:{data:Insights;series:keyof typeof seriesLabels;setSeries:(key:keyof typeof seriesLabels)=>void}) {
  const { current, previous, risks } = data;
  const metrics: { label:string; value:string; delta:number | null; unit?:string }[] = [
    { label:'Novos contatos', value:number.format(current.newContacts), delta:current.newContacts-previous.newContacts },
    { label:'Conversas iniciadas', value:number.format(current.conversations), delta:current.conversations-previous.conversations },
    { label:'Oportunidades criadas', value:number.format(current.opportunities), delta:current.opportunities-previous.opportunities },
    { label:'Negócios ganhos', value:number.format(current.wins), delta:current.wins-previous.wins },
    { label:'Taxa de ganho', value:current.winRate === null ? '—' : number.format(current.winRate)+'%', delta:current.winRate === null || previous.winRate === null ? null : current.winRate-previous.winRate, unit:' p.p.' },
    { label:'Valor de negócios ganhos', value:currency.format(current.revenue), delta:current.revenue-previous.revenue, unit:'reais' },
    { label:'Mediana da primeira resposta', value:current.medianResponse === null ? '—' : number.format(current.medianResponse)+' min', delta:current.medianResponse === null || previous.medianResponse === null ? null : current.medianResponse-previous.medianResponse, unit:' min' },
    { label:'Negócios perdidos', value:number.format(current.losses), delta:current.losses-previous.losses }
  ];
  const max = Math.max(1, ...data.trends.map(row => row[series]));
  return <>
    <p className={styles.insightsDate}>{dayLabel(data.start)} a {dayLabel(data.end)} · comparação com {dayLabel(data.previousStart)} a {dayLabel(data.previousEnd)}</p>
    <div className={styles.insightsMetrics}>{metrics.map(metric => <article key={metric.label}>
      <span>{metric.label}</span><strong>{metric.value}</strong>
      <small>{metric.delta === null ? 'Sem base para comparação' : metric.unit === 'reais' ? currency.format(metric.delta) + ' no comparativo' : signed.format(metric.delta) + (metric.unit ?? '') + ' no comparativo'}</small>
    </article>)}</div>
    <p className={styles.insightsDate}>Taxa de ganho sobre negócios concluídos. A mediana da primeira resposta considera {current.responseSample} conversa(s) com horário de resposta registrado.</p>
    <div className={styles.insightsGrid}>
      <section className={styles.insightsPanel}>
        <header className={styles.insightsHeader}><h3>Evolução diária</h3><label>Série <select className="select" value={series} onChange={event=>setSeries(event.target.value as keyof typeof seriesLabels)}>
          {Object.entries(seriesLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></label></header>
        <div className={styles.insightsBars} role="img" aria-label={seriesLabels[series] + ' por dia'}>
          {data.trends.map(row => <div key={row.day} title={dayLabel(row.day) + ' · ' + row[series]}><i style={{height: (row[series] / max * 100) + '%'}}/></div>)}
        </div>
        <div className={styles.insightsRange}><span>{dayLabel(data.start)}</span><span>{dayLabel(data.end)}</span></div>
        <details className={styles.insightsDetails}><summary>Ver números por dia</summary>
          <div className={styles.insightsTable}><table><thead><tr><th>Dia</th><th>Contatos</th><th>Conversas</th><th>Ganhos</th></tr></thead>
            <tbody>{data.trends.map(row=><tr key={row.day}><td>{dayLabel(row.day)}</td><td>{row.contacts}</td><td>{row.conversations}</td><td>{row.won}</td></tr>)}</tbody></table></div>
        </details>
      </section>
      <section className={styles.insightsPanel}>
        <h3>Pontos de atenção agora</h3>
        <ul className={styles.insightsRisks}>{[
          ['Conversas sem responsável',risks.unassigned,'/app/atendimento'],
          ['Conversas aguardando',risks.waitingConversations,'/app/atendimento'],
          ['SLA de primeira resposta excedido',risks.slaBreached,'/app/atendimento'],
          ['Oportunidades há mais de 48 h na etapa',risks.staleDeals,'/app/pipeline'],
          ['Tarefas vencidas',risks.overdueTasks,'/app/tarefas']
        ].map(([label,count,href]) => <li key={label}><a href={String(href)}>{label}</a><strong>{count}</strong></li>)}</ul>
      </section>
      <section className={styles.insightsPanel}>
        <h3>Atendimento por canal</h3>
        <div className={styles.insightsTable}><table><thead><tr><th>Canal</th><th>Entraram no período</th><th>Em aberto</th><th>Aguardando</th></tr></thead><tbody>
          {data.channels.length ? data.channels.map(row=><tr key={row.channel}><td>{channelLabels[row.channel]??row.channel}</td><td>{row.entered}</td><td>{row.open}</td><td>{row.waiting}</td></tr>) : <tr><td colSpan={4}>Sem conversas neste período.</td></tr>}
        </tbody></table></div>
      </section>
      <section className={styles.insightsPanel}>
        <h3>Resultados por origem</h3>
        <div className={styles.insightsTable}><table><thead><tr><th>Origem</th><th>Novos contatos</th><th>Ganhos</th><th>Valor ganho</th></tr></thead><tbody>
          {data.origins.length ? data.origins.map(row=><tr key={row.source}><td>{row.source}</td><td>{row.contacts}</td><td>{row.wins}</td><td>{currency.format(row.revenue)}</td></tr>) : <tr><td colSpan={4}>Sem registros neste período.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  </>;
}
