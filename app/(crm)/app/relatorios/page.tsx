'use client';

import { useEffect,useState } from 'react';
import { GoalsPanel } from '@/components/reports/GoalsPanel';

type Source={source:string;contacts:number;won:number;revenue:number;conversion:number};
type Report={
  openPipeline:number;weightedForecast:number;wonRevenue:number;conversionRate:number;averageTicket:number;
  overdue:number;openConversations:number;slaBreached:number;averageFirstResponseMinutes:number;
  leads:number;active:number;hotLeads:number;totalContacts:number;totalDeals:number;sourcePerformance:Source[];
};

function money(v:number){return Number(v??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

export default function Relatorios(){
  const [d,setD]=useState<Report|null>(null);
  const [error,setError]=useState('');

  useEffect(()=>{
    fetch('/api/reports',{cache:'no-store'})
      .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error);setD(j.data);})
      .catch(()=>setError('Relatórios indisponíveis para este usuário ou empresa.'));
  },[]);

  return <div className="content">
    <h1 className="page-title">Relatórios</h1>
    <p className="page-sub">Indicadores comerciais, atendimento e eficiência por origem.</p>

    {error?<div className="error">{error}</div>:!d?<div className="card empty">Carregando...</div>:<>
      <div className="grid stats">
        <div className="card stat"><div className="stat-value">{money(d.openPipeline)}</div><div className="stat-label">Pipeline aberto</div></div>
        <div className="card stat"><div className="stat-value">{money(d.weightedForecast)}</div><div className="stat-label">Forecast ponderado</div></div>
        <div className="card stat"><div className="stat-value">{money(d.wonRevenue)}</div><div className="stat-label">Receita ganha</div></div>
        <div className="card stat"><div className="stat-value">{d.conversionRate}%</div><div className="stat-label">Conversão de fechados</div></div>
      </div>

      <section className="card section">
        <h3>Operação comercial</h3>
        <div className="report-grid">
          <div><strong>{d.totalContacts}</strong><span>Contatos</span></div>
          <div><strong>{d.leads}</strong><span>Leads</span></div>
          <div><strong>{d.hotLeads}</strong><span>Leads quentes</span></div>
          <div><strong>{d.totalDeals}</strong><span>Negócios</span></div>
          <div><strong>{money(d.averageTicket)}</strong><span>Ticket médio</span></div>
          <div><strong>{d.openConversations}</strong><span>Atendimentos abertos</span></div>
          <div><strong>{d.slaBreached}</strong><span>SLA excedido</span></div>
          <div><strong>{d.averageFirstResponseMinutes} min</strong><span>1ª resposta média</span></div>
        </div>
      </section>

      <section className="card section">
        <h3>Desempenho por origem</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Origem</th><th>Contatos</th><th>Vendas</th><th>Conversão</th><th>Receita</th></tr></thead>
            <tbody>{d.sourcePerformance.length?d.sourcePerformance.map(row=><tr key={row.source}>
              <td>{row.source}</td><td>{row.contacts}</td><td>{row.won}</td><td>{row.conversion}%</td><td>{money(row.revenue)}</td>
            </tr>):<tr><td colSpan={5}>Sem dados suficientes.</td></tr>}</tbody>
          </table>
        </div>
      </section>

      <GoalsPanel/>

      {d.overdue>0&&<div className="error">{d.overdue} tarefa(s) vencida(s) precisam de atenção.</div>}
    </>}
  </div>;
}
