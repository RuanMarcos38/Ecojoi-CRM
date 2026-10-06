'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  Activity, Bot, CheckCircle2, CloudCog, Database, Download, FileText, MessageCircle,
  RefreshCw, RotateCcw, ServerCog, ShieldCheck, TriangleAlert, UploadCloud, Workflow
} from 'lucide-react';
import { WhatsAppConnectionPanel } from '@/components/integrations/WhatsAppConnectionPanel';

type Health = {
  whatsapp?: { provider:'meta'|'evolution'; ok:boolean; state?:string };
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
type AiUsage = { days:number; requests:number; input_tokens:number; output_tokens:number; total_tokens:number; estimated_cost:number; by_model?:Array<{name:string;requests:number;tokens:number;cost:number}> };
type Retention = { attachment_retention_days:number };
type ExternalStatus = {
  connections:Array<{
    id:string;provider:string;account_email?:string|null;display_name?:string|null;status:string;
    sync_email:boolean;sync_calendar:boolean;last_mail_sync_at?:string|null;last_calendar_sync_at?:string|null;last_error?:string|null;
  }>;
  counts:{emails:number;calendar:number;transcripts:number};
};

function statusLabel(ok?: boolean) { return ok ? 'Operacional' : 'Pendente'; }

export default function Integracoes() {
  const [health,setHealth]=useState<Health>({});
  const [templates,setTemplates]=useState<Template[]>([]);
  const [versions,setVersions]=useState<Version[]>([]);
  const [logs,setLogs]=useState<Log[]>([]);
  const [knowledge,setKnowledge]=useState<Knowledge[]>([]);
  const [agent,setAgent]=useState<any>({});
  const [aiUsage,setAiUsage]=useState<AiUsage>({days:30,requests:0,input_tokens:0,output_tokens:0,total_tokens:0,estimated_cost:0});
  const [retention,setRetention]=useState<Retention>({attachment_retention_days:365});
  const [external,setExternal]=useState<ExternalStatus>({connections:[],counts:{emails:0,calendar:0,transcripts:0}});
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');

  async function load() {
    const [hr,tr,nr,ar,kr,ur,rr,er]=await Promise.all([
      fetch('/api/integrations/health',{cache:'no-store'}),
      fetch('/api/integrations/meta/templates',{cache:'no-store'}),
      fetch('/api/integrations/n8n/operations',{cache:'no-store'}),
      fetch('/api/integrations/ai/settings',{cache:'no-store'}),
      fetch('/api/integrations/ai/knowledge',{cache:'no-store'}),
      fetch('/api/integrations/ai/usage?days=30',{cache:'no-store'}),
      fetch('/api/integrations/storage/retention',{cache:'no-store'}),
      fetch('/api/integrations/external/status',{cache:'no-store'})
    ]);
    const [hd,td,nd,ad,kd,ud,rd,ed]=await Promise.all([
      hr.json().catch(()=>null),tr.json().catch(()=>null),nr.json().catch(()=>null),ar.json().catch(()=>null),kr.json().catch(()=>null),
      ur.json().catch(()=>null),rr.json().catch(()=>null),er.json().catch(()=>null)
    ]);
    if(hr.ok) setHealth(hd?.data??{});
    if(tr.ok) setTemplates(td?.data??[]);
    if(nr.ok){setVersions(nd?.data?.versions??[]);setLogs(nd?.data?.logs??[]);}
    if(ar.ok) setAgent(ad?.data??{});
    if(kr.ok) setKnowledge(kd?.data??[]);
    if(ur.ok) setAiUsage(ud?.data??aiUsage);
    if(rr.ok) setRetention(rd?.data??retention);
    if(er.ok) setExternal(ed?.data??external);
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

  async function runWorkers(){
    setBusy('workers');setError('');setNotice('');
    const r=await fetch('/api/integrations/workers',{method:'POST'});
    const d=await r.json().catch(()=>null);
    setBusy('');
    if(r.ok){setNotice(`Automações processadas: ${d?.data?.processed??0}; sucesso: ${d?.data?.succeeded??0}; falhas: ${d?.data?.failed??0}.`);await load();}
    else setError('Não foi possível executar os workers.');
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
      confidence_handoff:Number(fd.get('confidence')??0.65)
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

  async function cleanupAttachments(){
    setBusy('retention');setError('');setNotice('');
    const r=await fetch('/api/integrations/storage/retention',{method:'POST'});
    const d=await r.json().catch(()=>null);
    setBusy('');
    if(r.ok){
      setNotice(`Retenção processada: ${d?.data?.removed??0} arquivos expirados removidos; histórico das mensagens preservado.`);
      await load();
    }else setError('Não foi possível executar a limpeza de anexos.');
  }

  async function saveRetention(days:number){
    setBusy('retention-save');setError('');setNotice('');
    const r=await fetch('/api/settings/company',{
      method:'PATCH',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({attachment_retention_days:days})
    });
    setBusy('');
    if(r.ok){setRetention({attachment_retention_days:days});setNotice('Política de retenção atualizada.');}
    else setError('Não foi possível atualizar a retenção.');
  }

  async function restore(versionId:string){
    if(!confirm('Restaurar esta versão como um novo workflow no n8n?'))return;
    setBusy('restore');setError('');setNotice('');
    const r=await fetch('/api/integrations/n8n/operations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version_id:versionId})});
    setBusy('');
    if(r.ok){setNotice('Versão restaurada/importada no n8n.');await load();} else setError('Não foi possível restaurar esta versão.');
  }

  const cards=[
    {label:health.whatsapp?.provider==='evolution'?'WhatsApp · Evolution API':'WhatsApp · Meta Cloud API',ok:health.whatsapp?.ok??health.meta?.ok,Icon:MessageCircle,detail:health.whatsapp?.ok?`Canal conectado · ${health.whatsapp?.state??'operacional'}`:(health.whatsapp?.provider==='evolution'?'Verifique instância/QR Code do Evolution':'Verifique API/IDs da Meta')},
    {label:'n8n / Agente IA',ok:health.n8n?.ok,Icon:Workflow,detail:health.n8n?.ok?'Webhook e importação disponíveis':'Webhook ou API n8n pendente'},
    {label:'Fila de mensagens',ok:(health.queue?.deadLetter??0)===0,Icon:ServerCog,detail:`${health.queue?.pending??0} pendentes · ${health.queue?.deadLetter??0} dead-letter`},
    {label:'SLA',ok:(health.sla?.breached??0)===0,Icon:Activity,detail:`${health.sla?.breached??0} atendimentos fora do SLA`}
  ];

  return <div className="content">
    <div className="page-head">
      <div><h1 className="page-title">Integrações e Operação</h1><p className="page-sub">Saúde dos canais, automações, IA e mensageria.</p></div>
      <div className="inlineActions"><button className="btn btn-secondary" onClick={()=>void load()}><RefreshCw size={15}/>Atualizar</button><button className="btn btn-primary" onClick={()=>void runWorkers()} disabled={busy==='workers'}><Workflow size={15}/>Processar automações</button></div>
    </div>

    {error&&<div className="error">{error}</div>}
    {notice&&<div className="success">{notice}</div>}

    <div className="settings-grid" style={{marginTop:12}}>
      <WhatsAppConnectionPanel/>
    </div>

    <section className="report-grid" style={{marginTop:12}}>
      {cards.map(({label,ok,Icon,detail})=><div key={label}>
        <span style={{display:'flex',alignItems:'center',gap:7}}><Icon size={16}/>{label}</span>
        <strong style={{fontSize:17}}>{statusLabel(ok)}</strong>
        <small className="muted">{detail}</small>
      </div>)}
    </section>

    <section className="report-grid" style={{marginTop:12}}>
      <div><span>Chamadas IA · 30 dias</span><strong>{aiUsage.requests}</strong><small className="muted">respostas com telemetria</small></div>
      <div><span>Tokens IA</span><strong>{aiUsage.total_tokens.toLocaleString('pt-BR')}</strong><small className="muted">{aiUsage.input_tokens.toLocaleString('pt-BR')} entrada · {aiUsage.output_tokens.toLocaleString('pt-BR')} saída</small></div>
      <div><span>Custo estimado IA</span><strong>{Number(aiUsage.estimated_cost||0).toLocaleString('pt-BR',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4})}</strong><small className="muted">informado pelo workflow/provedor</small></div>
      <div><span>Retenção de anexos</span><strong>{retention.attachment_retention_days} dias</strong><small className="muted">mensagens permanecem no histórico</small></div>
    </section>

    <div className="settings-grid" style={{marginTop:12}}>
      <section className="card section">
        <div className="automation-top">
          <div><h3>Templates e fila de mensagens</h3><p className="muted">Templates da Meta e reprocessamento seguro da fila de saída.</p></div>
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
        <div className="automation-top">
          <div><h3>Armazenamento e retenção</h3><p className="muted">Remove somente arquivos físicos vencidos; mensagens e auditoria permanecem.</p></div>
          <ServerCog size={20}/>
        </div>
        <div className="form-grid">
          <div className="field"><label>Manter anexos por</label><select className="select" value={String(retention.attachment_retention_days)} onChange={e=>void saveRetention(Number(e.target.value))} disabled={busy==='retention-save'}>
            <option value="30">30 dias</option><option value="60">60 dias</option><option value="90">90 dias</option><option value="180">180 dias</option><option value="365">1 ano</option><option value="730">2 anos</option><option value="1825">5 anos</option>
          </select></div>
          <div className="field" style={{justifyContent:'end'}}><label>&nbsp;</label><button className="btn btn-secondary" type="button" onClick={()=>void cleanupAttachments()} disabled={busy==='retention'}><RotateCcw size={14}/>{busy==='retention'?'Processando...':'Executar limpeza agora'}</button></div>
        </div>
        {aiUsage.by_model&&aiUsage.by_model.length>0&&<div className="table-wrap" style={{marginTop:12,maxHeight:180}}>
          <table className="table"><thead><tr><th>IA / modelo</th><th>Chamadas</th><th>Tokens</th><th>Custo est.</th></tr></thead><tbody>
            {aiUsage.by_model.map(row=><tr key={row.name}><td>{row.name}</td><td>{row.requests}</td><td>{row.tokens.toLocaleString('pt-BR')}</td><td>{Number(row.cost||0).toLocaleString('pt-BR',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4})}</td></tr>)}
          </tbody></table>
        </div>}
      </section>

      <section className="card section">
        <div className="automation-top">
          <div><h3>E-mail, calendário e reuniões</h3><p className="muted">Sincronização por API/n8n sem expor credenciais no CRM.</p></div>
          <Database size={20}/>
        </div>
        <div className="report-grid" style={{marginTop:10}}>
          <div><span>E-mails sincronizados</span><strong>{external.counts.emails}</strong><small className="muted">Gmail, Outlook ou conector externo</small></div>
          <div><span>Eventos de agenda</span><strong>{external.counts.calendar}</strong><small className="muted">Google Calendar / Outlook</small></div>
          <div><span>Transcrições</span><strong>{external.counts.transcripts}</strong><small className="muted">Reuniões e chamadas</small></div>
          <div><span>Conexões</span><strong>{external.connections.length}</strong><small className="muted">contas registradas</small></div>
        </div>
        <div className="table-wrap" style={{marginTop:12,maxHeight:220}}>
          <table className="table"><thead><tr><th>Provedor</th><th>Conta</th><th>Status</th><th>Última sincronização</th></tr></thead><tbody>
            {external.connections.length?external.connections.map(row=><tr key={row.id}><td>{row.provider}</td><td>{row.account_email??row.display_name??'—'}</td><td>{row.status}</td><td>{row.last_mail_sync_at||row.last_calendar_sync_at?new Date(row.last_mail_sync_at??row.last_calendar_sync_at??'').toLocaleString('pt-BR'):'—'}</td></tr>):<tr><td colSpan={4}>Nenhuma conexão externa registrada ainda.</td></tr>}
          </tbody></table>
        </div>
        <p className="muted" style={{fontSize:11}}>Use uma chave de API com o perfil “E-mail, calendário e transcrições” no n8n para sincronizar dados sem armazenar OAuth de terceiros no frontend.</p>
      </section>

      <section className="card section">
        <div className="automation-top">
          <div><h3>Exportação de segurança</h3><p className="muted">Snapshot JSON dos dados operacionais do tenant para conferência e contingência.</p></div>
          <ShieldCheck size={20}/>
        </div>
        <a className="btn btn-secondary" href="/api/settings/export"><Download size={14}/>Baixar exportação completa</a>
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
