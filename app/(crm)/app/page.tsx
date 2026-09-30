'use client';

import { useEffect,useMemo,useState } from 'react';
import { CircleDollarSign, Clock3, Flame, ListChecks, MessageCircle, Settings2, Target, TrendingUp, X } from 'lucide-react';
import styles from './dashboard.module.css';

type Dashboard={
  leads:number;hotLeads:number;openConversations:number;waitingConversations:number;slaBreached:number;
  conversion:number;openPipeline:number;weightedForecast:number;wonRevenue:number;averageTicket:number;
  openTasks:number;overdueTasks:number;
  stageBreakdown:Array<{stage:string;count:number;value:number}>;
  sourceBreakdown:Array<{source:string;count:number}>;
  myDay:{tasksToday:any[];overdueTasks:any[];hotLeads:any[];waitingConversations:number};
};

type WidgetPref={widget_key:string;position:number;enabled:boolean;config?:Record<string,unknown>};

const stageLabel:Record<string,string>={new:'Novo',qualification:'Qualificação',proposal:'Proposta',closing:'Fechamento',won:'Ganho',lost:'Perdido'};
const widgetLabels:Record<string,string>={
  hot_leads:'Leads quentes',
  attendance:'Atendimentos',
  forecast:'Forecast ponderado',
  won_revenue:'Receita ganha',
  priorities:'Prioridades de hoje',
  funnel:'Funil comercial',
  hot_leads_table:'Tabela de leads quentes',
  sources:'Origem da base'
};
const defaultKeys=Object.keys(widgetLabels);

function money(value:number){return Number(value??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

export default function Dashboard(){
  const [data,setData]=useState<Dashboard|null>(null);
  const [widgets,setWidgets]=useState<WidgetPref[]>([]);
  const [customizing,setCustomizing]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  async function load(){
    const [dr,wr]=await Promise.all([
      fetch('/api/dashboard',{cache:'no-store'}),
      fetch('/api/dashboard/widgets',{cache:'no-store'})
    ]);
    const [dj,wj]=await Promise.all([dr.json().catch(()=>null),wr.json().catch(()=>null)]);
    if(!dr.ok){setError('Não foi possível carregar o painel.');return;}
    setData(dj.data);
    if(wr.ok)setWidgets(wj.data??[]);
  }

  useEffect(()=>{void load();},[]);

  const prefs=useMemo(()=>{
    if(!widgets.length)return defaultKeys.map((key,index)=>({widget_key:key,position:index,enabled:true}));
    const map=new Map(widgets.map(item=>[item.widget_key,item]));
    return defaultKeys.map((key,index)=>map.get(key)??{widget_key:key,position:index,enabled:true});
  },[widgets]);

  function visible(key:string){return prefs.find(item=>item.widget_key===key)?.enabled!==false;}

  async function toggleWidget(key:string){
    const next=prefs.map(item=>item.widget_key===key?{...item,enabled:!item.enabled}:item);
    setWidgets(next);
    const r=await fetch('/api/dashboard/widgets',{
      method:'PUT',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({widgets:next.map((item,index)=>({widget_key:item.widget_key,position:index,enabled:item.enabled,config:item.config??{}}))})
    });
    if(!r.ok){setError('Não foi possível salvar a personalização do painel.');await load();}
    else setNotice('Painel personalizado.');
  }

  return <div className={`content dashboard-page ${styles.root}`}>
    <div className="approved-greeting">
      <div><h1>Meu dia</h1><p>Prioridades comerciais, atendimento e previsão de receita.</p></div>
      <button className="btn btn-secondary" onClick={()=>setCustomizing(v=>!v)}>{customizing?<X size={15}/>:<Settings2 size={15}/>} {customizing?'Fechar':'Personalizar'}</button>
    </div>

    {notice&&<div className="success">{notice}</div>}
    {error?<div className="error">{error}</div>:!data?<div className="card empty">Carregando painel...</div>:<>
      {customizing&&<section className="card section" style={{marginBottom:12}}>
        <h3>Widgets do painel</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:8}}>
          {prefs.map(item=><label className="setting-row" key={item.widget_key} style={{border:'1px solid #e5e9e7',borderRadius:6,padding:'9px 10px'}}>
            <span>{widgetLabels[item.widget_key]??item.widget_key}</span>
            <input type="checkbox" checked={item.enabled} onChange={()=>void toggleWidget(item.widget_key)}/>
          </label>)}
        </div>
      </section>}

      <section className="approved-kpis">
        {visible('hot_leads')&&<article className="approved-kpi"><div className="approved-kpi-label"><span className="approved-kpi-icon"><Flame size={16}/></span>Leads quentes</div><div className="approved-kpi-value">{data.hotLeads}</div><div className="approved-kpi-foot"><span>{data.leads} leads</span><small>priorização automática</small></div></article>}
        {visible('attendance')&&<article className="approved-kpi"><div className="approved-kpi-label"><span className="approved-kpi-icon"><MessageCircle size={16}/></span>Atendimentos</div><div className="approved-kpi-value">{data.openConversations}</div><div className="approved-kpi-foot"><span>{data.waitingConversations} esperando</span><small>{data.slaBreached} fora do SLA</small></div></article>}
        {visible('forecast')&&<article className="approved-kpi"><div className="approved-kpi-label"><span className="approved-kpi-icon"><TrendingUp size={16}/></span>Forecast ponderado</div><div className="approved-kpi-value" style={{fontSize:23}}>{money(data.weightedForecast)}</div><div className="approved-kpi-foot"><span>{money(data.openPipeline)}</span><small>pipeline aberto</small></div></article>}
        {visible('won_revenue')&&<article className="approved-kpi"><div className="approved-kpi-label"><span className="approved-kpi-icon"><CircleDollarSign size={16}/></span>Receita ganha</div><div className="approved-kpi-value" style={{fontSize:23}}>{money(data.wonRevenue)}</div><div className="approved-kpi-foot"><span>{data.conversion}%</span><small>conversão fechados</small></div></article>}
      </section>

      {(visible('priorities')||visible('funnel'))&&<section className="approved-mid-grid">
        {visible('priorities')&&<div className="approved-panel">
          <div className="approved-panel-head"><div><h3>Prioridades de hoje</h3><p>Itens que exigem ação imediata.</p></div></div>
          <div className="approved-activity-list">
            <div><span><ListChecks size={15}/></span><div><b>Tarefas para hoje</b><small>{data.myDay.tasksToday.length} tarefas atribuídas a você</small></div><em>{data.myDay.tasksToday.length}</em></div>
            <div><span className={data.myDay.overdueTasks.length?'warning':''}><Clock3 size={15}/></span><div><b>Tarefas vencidas</b><small>Priorize antes de novos follow-ups</small></div><em>{data.myDay.overdueTasks.length}</em></div>
            <div><span><Flame size={15}/></span><div><b>Leads quentes</b><small>Score alto sob sua responsabilidade</small></div><em>{data.myDay.hotLeads.length}</em></div>
            <div><span className={data.myDay.waitingConversations?'warning':''}><MessageCircle size={15}/></span><div><b>Conversas aguardando</b><small>Atendimentos atribuídos sem ação</small></div><em>{data.myDay.waitingConversations}</em></div>
          </div>
        </div>}

        {visible('funnel')&&<div className="approved-panel">
          <div className="approved-panel-head"><div><h3>Funil comercial</h3><p>Volume e valor por etapa.</p></div></div>
          <div style={{display:'grid',gap:8}}>
            {data.stageBreakdown.map(s=><div key={s.stage} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:8,padding:'8px 0',borderBottom:'1px solid #edf0ee'}}>
              <span style={{fontSize:11}}>{stageLabel[s.stage]??s.stage}</span>
              <span style={{fontSize:10,color:'#6f7a75'}}>{s.count} · {money(s.value)}</span>
            </div>)}
          </div>
        </div>}
      </section>}

      {(visible('hot_leads_table')||visible('sources'))&&<section className="approved-bottom-grid">
        {visible('hot_leads_table')&&<div className="approved-panel">
          <div className="approved-panel-head"><div><h3>Leads quentes sob sua responsabilidade</h3><p>Ordenados por score.</p></div></div>
          <div className="approved-table-wrap"><table><thead><tr><th>Lead</th><th>Origem</th><th>Score</th></tr></thead><tbody>
            {data.myDay.hotLeads.length?data.myDay.hotLeads.map((lead:any)=><tr key={lead.id}><td><strong>{lead.name}</strong></td><td>{lead.source??'—'}</td><td>{lead.lead_score}</td></tr>):<tr><td colSpan={3}>Nenhum lead quente atribuído.</td></tr>}
          </tbody></table></div>
        </div>}

        {visible('sources')&&<div className="approved-panel">
          <div className="approved-panel-head"><div><h3>Origem da base</h3><p>Canais com mais entradas.</p></div><Target size={16}/></div>
          <div style={{display:'grid',gap:8}}>
            {data.sourceBreakdown.map(s=><div key={s.source} style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:10}}><span>{s.source}</span><strong>{s.count}</strong></div>)}
          </div>
        </div>}
      </section>}
    </>}
  </div>;
}
