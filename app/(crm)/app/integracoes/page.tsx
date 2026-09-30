'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  Activity, Bot, CheckCircle2, CloudCog, Database, FileText, MessageCircle,
  RefreshCw, RotateCcw, ServerCog, ShieldCheck, TriangleAlert, UploadCloud, Workflow
} from 'lucide-react';

type Health = {
  meta?: { ok:boolean; runtimeConfigured:boolean; identifiersConfigured:boolean };
  n8n?: { ok:boolean; importConfigured:boolean; webhookConfigured:boolean; aiEnabled:boolean; workflowId?:string|null; lastExecution?:any };
  queue?: { pending:number; deadLetter:number };
  sla?: { breached:number };
  n8nExecutions?: { failed24h:number };
  events24h?: Array<{id:number;provider:string;event_type:string;received_at:string}>;
};

type Template = { id:string; name:string; language:string; category?:string|null; status?:string|null; last_synced_at?:string|null };
type Version = { id:string; workflow_id?:string|null; workflow_name:string; version_number:number; created_at:string };
type Log = { id:string; event_type:string; status:string; duration_ms?:number|null; error?:string|null; created_at:string };
type Knowledge = { id:string; name:string; active:boolean; created_at:string };

function statusLabel(ok?: boolean) { return ok ? 'Operacional' : 'Pendente'; }

export default function Integracoes() {
  const [health,setHealth]=useState<Health>({});
  const [templates,setTemplates]=useState<Template[]>([]);
  const [versions,setVersions]=useState<Version[]>([]);
  const [logs,setLogs]=useState<Log[]>([]);
  const [knowledge,setKnowledge]=useState<Knowledge[]>([]);
  const [agent,setAgent]=useState<any>({});
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');

  async function load() {
    const [hr,tr,nr,ar,kr]=await Promise.all([
      fetch('/api/integrations/health',{cache:'no-store'}),
      fetch('/api/integrations/meta/templates',{cache:'no-store'}),
      fetch('/api/integrations/n8n/operations',{cache:'no-store'}),
      fetch('/api/integrations/ai/settings',{cache:'no-store'}),
      fetch('/api/integrations/ai/knowledge',{cache:'no-store'})
    ]);
    const [hd,td,nd,ad,kd]=await Promise.all([
      hr.json().catch(()=>null),tr.json().catch(()=>null),nr.json().catch(()=>null),ar.json().catch(()=>null),kr.json().catch(()=>null)
    ]);
    if(hr.ok) setHealth(hd?.data??{});
    if(tr.ok) setTemplates(td?.data??[]);
    if(nr.ok){setVersions(nd?.data?.versions??[]);setLogs(nd?.data?.logs??[]);}
    if(ar.ok) setAgent(ad?.data??{});
    if(kr.ok) setKnowledge(kd?.data??[]);
  }

  useEffect(()=>{void load(); const timer=window.setInterval(()=>void load(),30000); return()=>window.clearInterval(timer);},[]);

  async function syncTemplates(){
    setBusy('templates');setError('');setNotice('');
    const r=await fetch('/api/integrations/meta/templates',{method:'POST'});
    const d=await r.json().catch(()=>null);
    setBusy('');
    if(r.ok){setNotice(`${d?.data?.count??0} templates sincronizados.`);await load();}
    else setError('Não foi possível sincronizar templates da Meta.');
  }

  async function retryQueue(){
    setBusy('queue');setError('');setNotice('');
    const r=await fetch('/api/integrations/outbound-queue',{method:'POST'});
    const d=await r.json().catch(()=>null);
    setBusy('');
    if(r.ok){setNotice(`Fila processada: ${d?.data?.sent??0} enviados, ${d?.data?.failed??0} aguardando nova tentativa.`);await load();}
    else setError('Não foi possível processar a fila.');
  }

  async function saveAgent(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy('agent');setError('');setNotice('');
    const fd=new FormData(e.currentTarget);
    const body={
      name:String(fd.get('name')??''),
      tone:String(fd.get('tone')??'professional'),
      objective:String(fd.get('objective')??''),
      rules:String(fd.get('rules')??''),
      human_handoff_keywords:String(fd.get('handoff')??'').split(',').map(v=>v.trim()).filter(Boolean),
      confidence_handoff:Number(fd.get('confidence')??0.65),
      ai_daily_message_limit:Number(fd.get('daily_limit')??1000),
      attachment_retention_days:Number(fd.get('retention_days')??365)
    };
    const r=await fetch('/api/integrations/ai/settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    setBusy('');
    if(r.ok){setNotice('Configuração do agente atualizada.');await load();} else setError('Não foi possível salvar o agente.');
  }

  async function addKnowledge(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy('knowledge');setError('');setNotice('');
    const fd=new FormData(e.currentTarget);
    const r=await fetch('/api/integrations/ai/knowledge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:fd.get('name'),text:fd.get('text')})});
    setBusy('');
    if(r.ok){e.currentTarget.reset();setNotice('Conteúdo adicionado à base da IA.');await load();} else setError('Não foi possível adicionar o conteúdo.');
  }

  async function restore(versionId:string){
    if(!confirm('Restaurar esta versão como um novo workflow no n8n?'))return;
    setBusy('restore');setError('');setNotice('');
    const r=await fetch('/api/integrations/n8n/operations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version_id:versionId})});
    setBusy('');
    if(r.ok){setNotice('Versão restaurada/importada no n8n.');await load();} else setError('Não foi possível restaurar esta versão.');
  }

  const cards=[
    {label:'Meta / WhatsApp',ok:health.meta?.ok,Icon:MessageCircle,detail:health.meta?.ok?'API e identificadores configurados':'Verifique API/IDs da Meta'},
    {label:'n8n / Agente IA',ok:health.n8n?.ok,Icon:Workflow,detail:health.n8n?.ok?'Webhook e importação disponíveis':'Webhook ou API n8n pendente'},
    {label:'Fila de mensagens',ok:(health.queue?.deadLetter??0)===0,Icon:ServerCog,detail:`${health.queue?.pending??0} pendentes · ${health.queue?.deadLetter??0} dead-letter`},
    {label:'SLA',ok:(health.sla?.breached??0)===0,Icon:Activity,detail:`${health.sla?.breached??0} atendimentos fora do SLA`}
  ];

  return <div className="content">
    <div className="page-head">
      <div><h1 className="page-title">Integrações e Operação</h1><p className="page-sub">Saúde dos canais, automações, IA e mensageria.</p></div>
      <button className="btn btn-secondary" onClick={()=>void load()}><RefreshCw size={15}/>Atualizar</button>
    </div>

    {error&&<div className="error">{error}</div>}
    {notice&&<div className="success">{notice}</div>}

    <section className="report-grid">
      {cards.map(({label,ok,Icon,detail})=><div key={label}>
        <span style={{display:'flex',alignItems:'center',gap:7}}><Icon size={16}/>{label}</span>
        <strong style={{fontSize:17}}>{statusLabel(ok)}</strong>
        <small className="muted">{detail}</small>
      </div>)}
    </section>

    <div className="settings-grid" style={{marginTop:12}}>
      <section className="card section">
        <div className="automation-top">
          <div><h3>WhatsApp oficial</h3><p className="muted">Templates aprovados e fila de retentativa.</p></div>
          <ShieldCheck size={20}/>
        </div>
        <div className="inlineActions">
          <button className="btn btn-primary" onClick={()=>void syncTemplates()} disabled={busy==='templates'}><RefreshCw size={14}/>Sincronizar templates</button>
          <button className="btn btn-secondary" onClick={()=>void retryQueue()} disabled={busy==='queue'}><RotateCcw size={14}/>Reprocessar fila</button>
        </div>
        <div className="table-wrap" style={{marginTop:12,maxHeight:280}}>
          <table className="table"><thead><tr><th>Template</th><th>Idioma</th><th>Status</th></tr></thead><tbody>
            {templates.length?templates.map(t=><tr key={t.id}><td>{t.name}</td><td>{t.language}</td><td>{t.status??'—'}</td></tr>):<tr><td colSpan={3}>Nenhum template sincronizado.</td></tr>}
          </tbody></table>
        </div>
      </section>

      <section className="card section">
        <div className="automation-top">
          <div><h3>Agente IA</h3><p className="muted">Comportamento e handoff para atendimento humano.</p></div>
          <Bot size={20}/>
        </div>
        <form onSubmit={saveAgent} style={{display:'grid',gap:10}}>
          <div className="form-grid">
            <div className="field"><label>Nome do agente</label><input className="input" name="name" defaultValue={agent.name??''}/></div>
            <div className="field"><label>Tom</label><select className="select" name="tone" defaultValue={agent.tone??'professional'}><option value="professional">Profissional</option><option value="friendly">Amigável</option><option value="consultative">Consultivo</option><option value="direct">Direto</option></select></div>
          </div>
          <div className="field"><label>Objetivo</label><textarea className="textarea" name="objective" rows={3} defaultValue={agent.objective??''}/></div>
          <div className="field"><label>Regras do atendimento</label><textarea className="textarea" name="rules" rows={5} defaultValue={agent.rules??''}/></div>
          <div className="form-grid">
            <div className="field"><label>Transferir ao humano quando mencionar</label><input className="input" name="handoff" defaultValue={(agent.human_handoff_keywords??[]).join(', ')} placeholder="atendente, reclamação, orçamento"/></div>
            <div className="field"><label>Confiança mínima da IA</label><input className="input" name="confidence" type="number" step="0.05" min="0" max="1" defaultValue={agent.confidence_handoff??0.65}/></div>
          </div>
          <div className="form-grid">
            <div className="field"><label>Limite diário de mensagens IA</label><input className="input" name="daily_limit" type="number" min="0" max="1000000" defaultValue={agent.ai_daily_message_limit??1000}/><small className="muted">{agent.usage_today??0} usadas hoje · {agent.usage_remaining??0} restantes</small></div>
            <div className="field"><label>Retenção de anexos (dias)</label><input className="input" name="retention_days" type="number" min="1" max="3650" defaultValue={agent.attachment_retention_days??365}/></div>
          </div>
          <button className="btn btn-primary" disabled={busy==='agent'}><CheckCircle2 size={14}/>Salvar agente</button>
        </form>
      </section>

      <section className="card section">
        <div className="automation-top"><div><h3>Base de conhecimento</h3><p className="muted">Conteúdo real enviado ao agente n8n em cada atendimento.</p></div><Database size={20}/></div>
        <form onSubmit={addKnowledge} style={{display:'grid',gap:9}}>
          <div className="field"><label>Nome</label><input className="input" name="name" required placeholder="Ex.: Catálogo 2026"/></div>
          <div className="field"><label>Conteúdo</label><textarea className="textarea" name="text" required rows={5} placeholder="Cole FAQ, catálogo, políticas ou informações comerciais..."/></div>
          <button className="btn btn-primary" disabled={busy==='knowledge'}><UploadCloud size={14}/>Adicionar à base</button>
        </form>
        <div style={{display:'grid',gap:6,marginTop:12}}>
          {knowledge.map(k=><div className="setting-row" key={k.id}><span><FileText size={14}/> {k.name}</span><small className="muted">{k.active?'Ativo':'Inativo'}</small></div>)}
        </div>
      </section>

      <section className="card section">
        <div className="automation-top"><div><h3>n8n · versões e execuções</h3><p className="muted">Histórico para diagnóstico e rollback seguro.</p></div><CloudCog size={20}/></div>
        <h4 style={{margin:'10px 0 6px'}}>Versões</h4>
        <div style={{display:'grid',gap:6,maxHeight:180,overflow:'auto'}}>
          {versions.length?versions.map(v=><div className="setting-row" key={v.id}><span><strong>{v.workflow_name}</strong><small className="muted" style={{display:'block'}}>v{v.version_number} · {new Date(v.created_at).toLocaleString('pt-BR')}</small></span><button className="btn btn-secondary" onClick={()=>void restore(v.id)} disabled={busy==='restore'}><RotateCcw size={13}/>Restaurar</button></div>):<p className="muted">Nenhum workflow versionado.</p>}
        </div>
        <h4 style={{margin:'14px 0 6px'}}>Últimas execuções</h4>
        <div className="table-wrap" style={{maxHeight:220}}>
          <table className="table"><thead><tr><th>Evento</th><th>Status</th><th>Duração</th></tr></thead><tbody>
            {logs.length?logs.map(l=><tr key={l.id}><td>{l.event_type}</td><td>{l.status==='failed'?<span style={{color:'#b42318'}}><TriangleAlert size={13}/> Falhou</span>:l.status}</td><td>{l.duration_ms!=null?`${l.duration_ms} ms`:'—'}</td></tr>):<tr><td colSpan={3}>Sem execuções registradas.</td></tr>}
          </tbody></table>
        </div>
      </section>
    </div>

    <section className="card section">
      <h3>Eventos das integrações · últimas 24h</h3>
      <div className="table-wrap" style={{maxHeight:300}}>
        <table className="table"><thead><tr><th>Provedor</th><th>Evento</th><th>Recebido</th></tr></thead><tbody>
          {(health.events24h??[]).length?(health.events24h??[]).map(e=><tr key={e.id}><td>{e.provider}</td><td>{e.event_type}</td><td>{new Date(e.received_at).toLocaleString('pt-BR')}</td></tr>):<tr><td colSpan={3}>Nenhum evento nas últimas 24h.</td></tr>}
        </tbody></table>
      </div>
    </section>
  </div>;
}
