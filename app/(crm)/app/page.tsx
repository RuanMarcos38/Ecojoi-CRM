'use client';

import { useEffect,useState } from 'react';
import { Activity, CircleDollarSign, Clock3, Flame, ListChecks, MessageCircle, Target, TrendingUp } from 'lucide-react';
import styles from './dashboard.module.css';

type Dashboard={
  leads:number;hotLeads:number;openConversations:number;waitingConversations:number;slaBreached:number;
  conversion:number;openPipeline:number;weightedForecast:number;wonRevenue:number;averageTicket:number;
  openTasks:number;overdueTasks:number;
  stageBreakdown:Array<{stage:string;count:number;value:number}>;
  sourceBreakdown:Array<{source:string;count:number}>;
  myDay:{tasksToday:any[];overdueTasks:any[];hotLeads:any[];waitingConversations:number};
};

const stageLabel:Record<string,string>={new:'Novo',qualification:'Qualificação',proposal:'Proposta',closing:'Fechamento',won:'Ganho',lost:'Perdido'};

function money(value:number){return Number(value??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

export default function Dashboard(){
  const [data,setData]=useState<Dashboard|null>(null);
  const [error,setError]=useState('');

  useEffect(()=>{
    fetch('/api/dashboard',{cache:'no-store'})
      .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error);setData(j.data);})
      .catch(()=>setError('Não foi possível carregar o painel.'));
  },[]);

  return <div className={`content dashboard-page ${styles.root}`}>
    <div className="approved-greeting">
      <div><h1>Meu dia</h1><p>Prioridades comerciais, atendimento e previsão de receita.</p></div>
    </div>

    {error?<div className="error">{error}</div>:!data?<div className="card empty">Carregando painel...</div>:<>
      <section className="approved-kpis">
        <article className="approved-kpi"><div className="approved-kpi-label"><span className="approved-kpi-icon"><Flame size={16}/></span>Leads quentes</div><div className="approved-kpi-value">{data.hotLeads}</div><div className="approved-kpi-foot"><span>{data.leads} leads</span><small>priorização automática</small></div></article>
        <article className="approved-kpi"><div className="approved-kpi-label"><span className="approved-kpi-icon"><MessageCircle size={16}/></span>Atendimentos</div><div className="approved-kpi-value">{data.openConversations}</div><div className="approved-kpi-foot"><span>{data.waitingConversations} esperando</span><small>{data.slaBreached} fora do SLA</small></div></article>
        <article className="approved-kpi"><div className="approved-kpi-label"><span className="approved-kpi-icon"><TrendingUp size={16}/></span>Forecast ponderado</div><div className="approved-kpi-value" style={{fontSize:23}}>{money(data.weightedForecast)}</div><div className="approved-kpi-foot"><span>{money(data.openPipeline)}</span><small>pipeline aberto</small></div></article>
        <article className="approved-kpi"><div className="approved-kpi-label"><span className="approved-kpi-icon"><CircleDollarSign size={16}/></span>Receita ganha</div><div className="approved-kpi-value" style={{fontSize:23}}>{money(data.wonRevenue)}</div><div className="approved-kpi-foot"><span>{data.conversion}%</span><small>conversão fechados</small></div></article>
      </section>

      <section className="approved-mid-grid">
        <div className="approved-panel">
          <div className="approved-panel-head"><div><h3>Prioridades de hoje</h3><p>Itens que exigem ação imediata.</p></div></div>
          <div className="approved-activity-list">
            <div><span><ListChecks size={15}/></span><div><b>Tarefas para hoje</b><small>{data.myDay.tasksToday.length} tarefas atribuídas a você</small></div><em>{data.myDay.tasksToday.length}</em></div>
            <div><span className={data.myDay.overdueTasks.length?'warning':''}><Clock3 size={15}/></span><div><b>Tarefas vencidas</b><small>Priorize antes de novos follow-ups</small></div><em>{data.myDay.overdueTasks.length}</em></div>
            <div><span><Flame size={15}/></span><div><b>Leads quentes</b><small>Score alto sob sua responsabilidade</small></div><em>{data.myDay.hotLeads.length}</em></div>
            <div><span className={data.myDay.waitingConversations?'warning':''}><MessageCircle size={15}/></span><div><b>Conversas aguardando</b><small>Atendimentos atribuídos sem ação</small></div><em>{data.myDay.waitingConversations}</em></div>
          </div>
        </div>

        <div className="approved-panel">
          <div className="approved-panel-head"><div><h3>Funil comercial</h3><p>Volume e valor por etapa.</p></div></div>
          <div style={{display:'grid',gap:8}}>
            {data.stageBreakdown.map(s=><div key={s.stage} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:8,padding:'8px 0',borderBottom:'1px solid #edf0ee'}}>
              <span style={{fontSize:11}}>{stageLabel[s.stage]??s.stage}</span>
              <span style={{fontSize:10,color:'#6f7a75'}}>{s.count} · {money(s.value)}</span>
            </div>)}
          </div>
        </div>
      </section>

      <section className="approved-bottom-grid">
        <div className="approved-panel">
          <div className="approved-panel-head"><div><h3>Leads quentes sob sua responsabilidade</h3><p>Ordenados por score.</p></div></div>
          <div className="approved-table-wrap"><table><thead><tr><th>Lead</th><th>Origem</th><th>Score</th></tr></thead><tbody>
            {data.myDay.hotLeads.length?data.myDay.hotLeads.map((lead:any)=><tr key={lead.id}><td><strong>{lead.name}</strong></td><td>{lead.source??'—'}</td><td>{lead.lead_score}</td></tr>):<tr><td colSpan={3}>Nenhum lead quente atribuído.</td></tr>}
          </tbody></table></div>
        </div>

        <div className="approved-panel">
          <div className="approved-panel-head"><div><h3>Origem da base</h3><p>Canais com mais entradas.</p></div><Target size={16}/></div>
          <div style={{display:'grid',gap:8}}>
            {data.sourceBreakdown.map(s=><div key={s.source} style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:10}}><span>{s.source}</span><strong>{s.count}</strong></div>)}
          </div>
        </div>
      </section>
    </>}
  </div>;
}
