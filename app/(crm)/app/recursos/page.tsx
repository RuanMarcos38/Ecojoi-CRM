'use client';

import { FormEvent,useEffect,useState } from 'react';
import { Braces, FileInput, FormInput, MessageCircle, Plus, Save, Star, Webhook } from 'lucide-react';

type Field={id:string;entity_type:string;field_key:string;label:string;field_type:string;required:boolean};
type Hook={id:string;name:string;endpoint_url:string;events:string[];active:boolean;last_status?:number|null;last_error?:string|null};
type FormRow={id:string;name:string;slug:string;active:boolean;source?:string|null};
type Survey={id:string;name:string;survey_type:string;question:string;responses:number;average:number};
type Widget={id:string;name:string;public_key:string;active:boolean;welcome_message?:string|null;accent_color?:string|null;allowed_origins?:string[]};

export default function Recursos(){
  const [fields,setFields]=useState<Field[]>([]);
  const [hooks,setHooks]=useState<Hook[]>([]);
  const [forms,setForms]=useState<FormRow[]>([]);
  const [surveys,setSurveys]=useState<Survey[]>([]);
  const [widgets,setWidgets]=useState<Widget[]>([]);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [secret,setSecret]=useState('');

  async function load(){
    const [fr,hr,formr,sr,wr]=await Promise.all([
      fetch('/api/custom-fields',{cache:'no-store'}),fetch('/api/webhooks',{cache:'no-store'}),fetch('/api/forms',{cache:'no-store'}),fetch('/api/surveys',{cache:'no-store'}),fetch('/api/webchat-widgets',{cache:'no-store'})
    ]);
    const [fd,hd,formd,sd,wd]=await Promise.all([fr.json(),hr.json(),formr.json(),sr.json(),wr.json()]);
    if(fr.ok)setFields(fd.data??[]);
    if(hr.ok)setHooks(hd.data??[]);
    if(formr.ok)setForms(formd.data??[]);
    if(sr.ok)setSurveys(sd.data??[]);
    if(wr.ok)setWidgets(wd.data??[]);
  }
  useEffect(()=>{void load();},[]);

  async function createField(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');const fd=new FormData(e.currentTarget);
    const r=await fetch('/api/custom-fields',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({entity_type:fd.get('entity_type'),field_key:fd.get('field_key'),label:fd.get('label'),field_type:fd.get('field_type'),required:fd.get('required')==='on',options:[]})});
    if(r.ok){setNotice('Campo personalizado criado.');e.currentTarget.reset();await load();}else setError('Não foi possível criar o campo.');
  }
  async function createHook(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');setSecret('');const fd=new FormData(e.currentTarget);
    const events=String(fd.get('events')||'').split(',').map(v=>v.trim()).filter(Boolean);
    const r=await fetch('/api/webhooks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:fd.get('name'),endpoint_url:fd.get('endpoint_url'),events,active:true})});
    const d=await r.json().catch(()=>null);
    if(r.ok){setSecret(d?.data?.signing_secret??'');setNotice('Webhook criado. Copie o segredo de assinatura agora.');e.currentTarget.reset();await load();}else setError('Não foi possível criar o webhook.');
  }
  async function createForm(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');const fd=new FormData(e.currentTarget);
    const r=await fetch('/api/forms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:fd.get('name'),slug:fd.get('slug'),source:fd.get('source')||null,fields:[{key:'name',label:'Nome',required:true},{key:'email',label:'E-mail'},{key:'phone',label:'Telefone'},{key:'message',label:'Mensagem'}],success_message:'Recebemos seus dados. Em breve entraremos em contato.',active:true})});
    if(r.ok){setNotice('Formulário público criado.');e.currentTarget.reset();await load();}else setError('Não foi possível criar o formulário.');
  }
  async function createWidget(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');const fd=new FormData(e.currentTarget);
    const origins=String(fd.get('allowed_origins')||'').split(',').map(v=>v.trim()).filter(Boolean);
    const r=await fetch('/api/webchat-widgets',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:fd.get('name'),welcome_message:fd.get('welcome_message')||null,accent_color:fd.get('accent_color')||'#087a4b',allowed_origins:origins})});
    if(r.ok){setNotice('Webchat criado. Copie o script de incorporação abaixo.');e.currentTarget.reset();await load();}else setError('Não foi possível criar o webchat.');
  }

  async function createSurvey(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');const fd=new FormData(e.currentTarget);
    const r=await fetch('/api/surveys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:fd.get('name'),survey_type:fd.get('survey_type'),question:fd.get('question')})});
    if(r.ok){setNotice('Pesquisa criada.');e.currentTarget.reset();await load();}else setError('Não foi possível criar a pesquisa.');
  }

  return <div className="content">
    <div className="page-head"><div><h1 className="page-title">Recursos corporativos</h1><p className="page-sub">Campos, formulários, webhooks e experiência do cliente.</p></div></div>
    {error&&<div className="error">{error}</div>}{notice&&<div className="success">{notice}</div>}
    {secret&&<div className="success"><strong>Segredo do webhook:</strong> <code style={{overflowWrap:'anywhere'}}>{secret}</code></div>}

    <div className="settings-grid">
      <section className="card section">
        <h3><Braces size={16}/> Campos personalizados</h3>
        <form onSubmit={createField} style={{display:'grid',gap:9}}>
          <div className="form-grid">
            <div className="field"><label>Entidade</label><select className="select" name="entity_type"><option value="contact">Contato</option><option value="organization">Empresa</option><option value="deal">Oportunidade</option></select></div>
            <div className="field"><label>Tipo</label><select className="select" name="field_type"><option value="text">Texto</option><option value="number">Número</option><option value="date">Data</option><option value="boolean">Sim/Não</option><option value="select">Lista</option></select></div>
            <div className="field"><label>Chave</label><input className="input" name="field_key" required placeholder="ex.: segmento"/></div>
            <div className="field"><label>Rótulo</label><input className="input" name="label" required placeholder="Segmento"/></div>
          </div>
          <label className="setting-row" style={{border:0}}><span>Obrigatório</span><input name="required" type="checkbox"/></label>
          <button className="btn btn-primary"><Plus size={14}/>Criar campo</button>
        </form>
        <div style={{display:'grid',gap:5,marginTop:12}}>{fields.map(f=><div className="setting-row" key={f.id}><span><strong>{f.label}</strong><small className="muted" style={{display:'block'}}>{f.entity_type} · {f.field_type}</small></span><code>{f.field_key}</code></div>)}</div>
      </section>

      <section className="card section">
        <h3><Webhook size={16}/> Webhooks de saída</h3>
        <form onSubmit={createHook} style={{display:'grid',gap:9}}>
          <div className="field"><label>Nome</label><input className="input" name="name" required/></div>
          <div className="field"><label>Endpoint HTTPS</label><input className="input" name="endpoint_url" type="url" required/></div>
          <div className="field"><label>Eventos separados por vírgula</label><input className="input" name="events" required defaultValue="lead.created, message.received, deal.won"/></div>
          <button className="btn btn-primary"><Save size={14}/>Salvar webhook</button>
        </form>
        <div style={{display:'grid',gap:5,marginTop:12}}>{hooks.map(h=><div className="setting-row" key={h.id}><span><strong>{h.name}</strong><small className="muted" style={{display:'block'}}>{h.endpoint_url}</small></span><span className={h.active?'badge':'badge badge-off'}>{h.active?'Ativo':'Pausado'}</span></div>)}</div>
      </section>

      <section className="card section">
        <h3><FormInput size={16}/> Formulários públicos</h3>
        <form onSubmit={createForm} style={{display:'grid',gap:9}}>
          <div className="form-grid"><div className="field"><label>Nome</label><input className="input" name="name" required/></div><div className="field"><label>Slug</label><input className="input" name="slug" pattern="[a-z0-9-]+" required placeholder="contato-comercial"/></div></div>
          <div className="field"><label>Origem do lead</label><input className="input" name="source" placeholder="Site, Landing Page..."/></div>
          <button className="btn btn-primary"><FileInput size={14}/>Criar formulário</button>
        </form>
        <div style={{display:'grid',gap:5,marginTop:12}}>{forms.map(f=><div className="setting-row" key={f.id}><span><strong>{f.name}</strong><small className="muted" style={{display:'block'}}>/api/public/forms/{f.slug}</small></span><span className="badge">{f.active?'Ativo':'Inativo'}</span></div>)}</div>
      </section>

      <section className="card section">
        <h3><MessageCircle size={16}/> Webchat para sites</h3>
        <form onSubmit={createWidget} style={{display:'grid',gap:9}}>
          <div className="form-grid"><div className="field"><label>Nome</label><input className="input" name="name" required placeholder="Chat do site"/></div><div className="field"><label>Cor</label><input className="input" name="accent_color" defaultValue="#087a4b"/></div></div>
          <div className="field"><label>Mensagem inicial</label><input className="input" name="welcome_message" defaultValue="Olá! Como podemos ajudar?"/></div>
          <div className="field"><label>Domínios permitidos (separados por vírgula)</label><input className="input" name="allowed_origins" placeholder="https://site.com.br"/></div>
          <button className="btn btn-primary"><Plus size={14}/>Criar webchat</button>
        </form>
        <div style={{display:'grid',gap:8,marginTop:12}}>{widgets.map(w=><div className="card" style={{padding:10}} key={w.id}><strong>{w.name}</strong><small className="muted" style={{display:'block',margin:'3px 0 7px'}}>Chave: {w.public_key}</small><code style={{display:'block',fontSize:10,whiteSpace:'normal',overflowWrap:'anywhere'}}>{`<script src="${typeof window!=='undefined'?window.location.origin:''}/api/public/webchat-script?key=${w.public_key}" async></script>`}</code></div>)}</div>
      </section>

      <section className="card section">
        <h3><Star size={16}/> NPS / CSAT</h3>
        <form onSubmit={createSurvey} style={{display:'grid',gap:9}}>
          <div className="form-grid"><div className="field"><label>Nome</label><input className="input" name="name" required/></div><div className="field"><label>Tipo</label><select className="select" name="survey_type"><option value="nps">NPS</option><option value="csat">CSAT</option></select></div></div>
          <div className="field"><label>Pergunta</label><input className="input" name="question" required defaultValue="De 0 a 10, quanto você recomendaria nosso atendimento?"/></div>
          <button className="btn btn-primary"><Plus size={14}/>Criar pesquisa</button>
        </form>
        <div style={{display:'grid',gap:5,marginTop:12}}>{surveys.map(s=><div className="setting-row" key={s.id}><span><strong>{s.name}</strong><small className="muted" style={{display:'block'}}>{s.survey_type.toUpperCase()} · {s.responses} respostas</small></span><strong>{s.average}</strong></div>)}</div>
      </section>
    </div>
  </div>;
}
