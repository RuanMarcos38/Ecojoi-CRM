'use client';

import { FormEvent,useEffect,useState } from 'react';
import { Mail,MessageCircle,Play,Plus,RefreshCw,Workflow } from 'lucide-react';

type Sequence={id:string;name:string;description?:string|null;active:boolean;steps:Array<{id:string;position:number;delay_minutes:number;action_type:string;subject?:string|null;body:string}>;enrollments:number;active_enrollments:number};
type Contact={id:string;name:string;email?:string|null;phone?:string|null};

function delayLabel(minutes:number){if(minutes===0)return'Imediato';if(minutes%1440===0)return (minutes/1440)+' dia(s)';if(minutes%60===0)return (minutes/60)+' hora(s)';return minutes+' min';}

export default function Cadencias(){
  const [sequences,setSequences]=useState<Sequence[]>([]);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');

  async function load(){
    const [sr,cr]=await Promise.all([fetch('/api/sequences',{cache:'no-store'}),fetch('/api/contacts',{cache:'no-store'})]);
    const [sd,cd]=await Promise.all([sr.json(),cr.json()]);
    if(sr.ok)setSequences(sd.data??[]);
    if(cr.ok)setContacts(cd.data??[]);
  }
  useEffect(()=>{void load();},[]);

  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const fd=new FormData(e.currentTarget);
    const steps=[
      {delay_minutes:0,action_type:String(fd.get('step1_type')||'whatsapp'),subject:null,body:String(fd.get('step1_body')||'')},
      {delay_minutes:Number(fd.get('step2_delay')||2880),action_type:String(fd.get('step2_type')||'task'),subject:'Follow-up comercial',body:String(fd.get('step2_body')||'Fazer follow-up do lead {{nome}}.')}
    ].filter(step=>step.body.trim());
    const r=await fetch('/api/sequences',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:fd.get('name'),description:fd.get('description')||null,steps})});
    if(r.ok){setNotice('Cadência criada.');e.currentTarget.reset();await load();}else setError('Não foi possível criar a cadência.');
  }

  async function enroll(sequenceId:string,contactId:string){
    if(!contactId)return;setError('');setNotice('');
    const r=await fetch('/api/sequences/enroll',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sequence_id:sequenceId,contact_id:contactId})});
    if(r.ok){setNotice('Contato incluído na cadência.');await load();}else setError('Não foi possível incluir o contato.');
  }

  async function run(){
    setBusy('run');setError('');setNotice('');
    const r=await fetch('/api/automations/sequences/run',{method:'POST'});
    const d=await r.json().catch(()=>null);setBusy('');
    if(r.ok){setNotice('Cadências processadas: '+(d?.data?.processed??0)+' ações, '+(d?.data?.failed??0)+' falhas.');await load();}else setError('Não foi possível processar as cadências.');
  }

  return <div className="content">
    <div className="page-head">
      <div><h1 className="page-title">Cadências comerciais</h1><p className="page-sub">Sequências multicanal para WhatsApp, e-mail, tarefas e alertas internos.</p></div>
      <button className="btn btn-secondary" onClick={()=>void run()} disabled={busy==='run'}><RefreshCw size={15}/>Processar agora</button>
    </div>
    {error&&<div className="error">{error}</div>}{notice&&<div className="success">{notice}</div>}

    <form className="card section" onSubmit={create}>
      <h3>Nova cadência</h3>
      <div className="form-grid">
        <div className="field"><label>Nome</label><input className="input" name="name" required placeholder="Follow-up comercial"/></div>
        <div className="field"><label>Descrição</label><input className="input" name="description" placeholder="Processo padrão de acompanhamento"/></div>
      </div>
      <div className="form-grid" style={{marginTop:10}}>
        <div className="field"><label>Passo 1</label><select className="select" name="step1_type" defaultValue="whatsapp"><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="task">Tarefa</option><option value="internal_message">Alerta interno</option></select><textarea className="textarea" name="step1_body" rows={3} defaultValue="Olá {{nome}}, tudo bem? Estou entrando em contato para dar continuidade ao seu atendimento."/></div>
        <div className="field"><label>Passo 2</label><select className="select" name="step2_type" defaultValue="task"><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="task">Tarefa</option><option value="internal_message">Alerta interno</option></select><input className="input" name="step2_delay" type="number" min="0" defaultValue="2880"/><textarea className="textarea" name="step2_body" rows={2} defaultValue="Fazer follow-up do lead {{nome}}."/></div>
      </div>
      <p className="muted" style={{fontSize:11}}>Passo 2 usa atraso em minutos. 1440 = 1 dia; 2880 = 2 dias. E-mail usa o webhook n8n quando configurado.</p>
      <button className="btn btn-primary"><Plus size={14}/>Criar cadência</button>
    </form>

    <div className="automation-grid">
      {sequences.map(sequence=><article className="card automation-card" key={sequence.id}>
        <div className="automation-top"><span className={sequence.active?'badge':'badge badge-off'}>{sequence.active?'Ativa':'Pausada'}</span><Workflow size={18}/></div>
        <h3>{sequence.name}</h3>
        <p className="muted">{sequence.description||'Sem descrição'} · {sequence.active_enrollments} ativos</p>
        <div style={{display:'grid',gap:6,margin:'10px 0'}}>
          {sequence.steps.map(step=><div key={step.id} style={{display:'grid',gridTemplateColumns:'24px 1fr',gap:7,alignItems:'start',fontSize:11}}><span>{step.action_type==='whatsapp'?<MessageCircle size={14}/>:step.action_type==='email'?<Mail size={14}/>:<Play size={14}/>}</span><span><strong>{delayLabel(step.delay_minutes)}</strong><small className="muted" style={{display:'block'}}>{step.body}</small></span></div>)}
        </div>
        <select className="select" defaultValue="" onChange={e=>{const id=e.target.value;e.target.value='';void enroll(sequence.id,id);}}><option value="" disabled>Adicionar contato...</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </article>)}
      {!sequences.length&&<div className="card empty">Nenhuma cadência criada.</div>}
    </div>
  </div>;
}
