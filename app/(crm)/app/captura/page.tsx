'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Code2, ExternalLink, FormInput, MessageSquare, Plus, Webhook } from 'lucide-react';
import WebhookPanel from '@/components/integrations/WebhookPanel';

type FormItem={id:string;slug:string;name:string;title:string;active:boolean};
type Booking={id:string;slug:string;name:string;duration_minutes:number;active:boolean};
type Widget={id:string;public_key:string;name:string;welcome_message:string;active:boolean};
type Hook={id:string;name:string;endpoint_url:string;events:string[];active:boolean;last_status?:number|null};
type Me={companySlug:string};

export default function Captura(){
  const [forms,setForms]=useState<FormItem[]>([]);
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [widgets,setWidgets]=useState<Widget[]>([]);
  const [hooks,setHooks]=useState<Hook[]>([]);
  const [me,setMe]=useState<Me|null>(null);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const origin=typeof window!=='undefined'?window.location.origin:'';

  async function load(){
    const [fr,br,wr,hr,mr]=await Promise.all([
      fetch('/api/capture/forms',{cache:'no-store'}),
      fetch('/api/capture/booking-links',{cache:'no-store'}),
      fetch('/api/capture/chat-widgets',{cache:'no-store'}),
      fetch('/api/integrations/webhooks',{cache:'no-store'}),
      fetch('/api/me',{cache:'no-store'})
    ]);
    const [fd,bd,wd,hd,md]=await Promise.all([fr.json(),br.json(),wr.json(),hr.json(),mr.json()]);
    if(fr.ok)setForms(fd.data??[]);
    if(br.ok)setBookings(bd.data??[]);
    if(wr.ok)setWidgets(wd.data??[]);
    if(hr.ok)setHooks(hd.data??[]);
    if(mr.ok)setMe(md.data??null);
  }

  useEffect(()=>{void load();},[]);

  const tenant=me?.companySlug||'empresa';
  const formUrl=(slug:string)=>`${origin}/forms/${tenant}/${slug}`;
  const bookingUrl=(slug:string)=>`${origin}/book/${tenant}/${slug}`;
  const chatUrl=(key:string)=>`${origin}/chat/${key}`;

  async function createForm(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const form=e.currentTarget;
    const fd=new FormData(form);
    const r=await fetch('/api/capture/forms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      slug:String(fd.get('slug')??'').trim().toLowerCase(),
      name:String(fd.get('name')??'').trim(),
      title:String(fd.get('title')??'').trim(),
      description:String(fd.get('description')??'').trim()||null,
      source:String(fd.get('source')??'Formulário').trim(),
      active:true
    })});
    if(r.ok){form.reset();setNotice('Formulário criado.');await load();}else setError('Não foi possível criar o formulário.');
  }

  async function createBooking(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const form=e.currentTarget;
    const fd=new FormData(form);
    const r=await fetch('/api/capture/booking-links',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      slug:String(fd.get('slug')??'').trim().toLowerCase(),
      name:String(fd.get('name')??'').trim(),
      duration_minutes:Number(fd.get('duration_minutes')??30),
      active:true
    })});
    if(r.ok){form.reset();setNotice('Link de agendamento criado.');await load();}else setError('Não foi possível criar o agendamento.');
  }

  async function createWidget(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const form=e.currentTarget;
    const fd=new FormData(form);
    const r=await fetch('/api/capture/chat-widgets',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      name:String(fd.get('name')??'').trim(),
      welcome_message:String(fd.get('welcome_message')??'').trim(),
      active:true
    })});
    if(r.ok){form.reset();setNotice('Chat criado.');await load();}else setError('Não foi possível criar o chat.');
  }

  async function createWebhook(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const form=e.currentTarget;
    const fd=new FormData(form);
    const events=String(fd.get('events')??'lead.created').split(',').map(v=>v.trim()).filter(Boolean);
    const r=await fetch('/api/integrations/webhooks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      name:String(fd.get('name')??'').trim(),
      endpoint_url:String(fd.get('endpoint_url')??'').trim(),
      events
    })});
    const d=await r.json().catch(()=>null);
    if(r.ok){form.reset();setNotice(`Webhook criado. Segredo de assinatura: ${d?.data?.signing_secret??'gerado'} — copie e armazene com segurança.`);await load();}
    else setError('Não foi possível criar o webhook.');
  }

  const total=useMemo(()=>forms.length+bookings.length+widgets.length+hooks.length,[forms,bookings,widgets,hooks]);

  return <div className="content">
    <div className="page-head">
      <div><h1 className="page-title">Captura & Integrações</h1><p className="page-sub">Formulários, agendamento, chat do site e webhooks externos.</p></div>
      <span className="badge">{total} recurso(s)</span>
    </div>

    {error&&<div className="error">{error}</div>}
    {notice&&<div className="success">{notice}</div>}

    <div className="settings-grid">
      <section className="card section">
        <div className="automation-top"><div><h3>Formulários públicos</h3><p className="muted">Leads entram diretamente no CRM com origem e UTMs.</p></div><FormInput size={20}/></div>
        <form onSubmit={createForm} style={{display:'grid',gap:8}}>
          <div className="form-grid">
            <div className="field"><label>Nome interno</label><input className="input" name="name" required/></div>
            <div className="field"><label>Slug</label><input className="input" name="slug" placeholder="orcamento" required/></div>
          </div>
          <div className="field"><label>Título público</label><input className="input" name="title" required/></div>
          <div className="field"><label>Descrição</label><input className="input" name="description"/></div>
          <div className="field"><label>Origem do lead</label><input className="input" name="source" defaultValue="Formulário"/></div>
          <button className="btn btn-primary"><Plus size={14}/>Criar formulário</button>
        </form>
        <div style={{display:'grid',gap:7,marginTop:12}}>{forms.map(f=><div className="setting-row" key={f.id}><span><strong>{f.name}</strong><small className="muted" style={{display:'block'}}>{formUrl(f.slug)}</small></span><a className="btn btn-secondary" target="_blank" rel="noreferrer" href={formUrl(f.slug)}><ExternalLink size={13}/></a></div>)}</div>
      </section>

      <section className="card section">
        <div className="automation-top"><div><h3>Agendamento público</h3><p className="muted">Links de reunião que criam contato e tarefa automaticamente.</p></div><CalendarClock size={20}/></div>
        <form onSubmit={createBooking} style={{display:'grid',gap:8}}>
          <div className="form-grid">
            <div className="field"><label>Nome</label><input className="input" name="name" required/></div>
            <div className="field"><label>Slug</label><input className="input" name="slug" placeholder="reuniao" required/></div>
          </div>
          <div className="field"><label>Duração</label><select className="select" name="duration_minutes" defaultValue="30"><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option></select></div>
          <button className="btn btn-primary"><Plus size={14}/>Criar link</button>
        </form>
        <div style={{display:'grid',gap:7,marginTop:12}}>{bookings.map(b=><div className="setting-row" key={b.id}><span><strong>{b.name}</strong><small className="muted" style={{display:'block'}}>{bookingUrl(b.slug)}</small></span><a className="btn btn-secondary" target="_blank" rel="noreferrer" href={bookingUrl(b.slug)}><ExternalLink size={13}/></a></div>)}</div>
      </section>

      <section className="card section">
        <div className="automation-top"><div><h3>Chat do site</h3><p className="muted">Cada visitante pode virar contato e atendimento automaticamente.</p></div><MessageSquare size={20}/></div>
        <form onSubmit={createWidget} style={{display:'grid',gap:8}}>
          <div className="field"><label>Nome</label><input className="input" name="name" required/></div>
          <div className="field"><label>Mensagem de boas-vindas</label><input className="input" name="welcome_message" defaultValue="Olá! Como podemos ajudar?" required/></div>
          <button className="btn btn-primary"><Plus size={14}/>Criar chat</button>
        </form>
        <div style={{display:'grid',gap:7,marginTop:12}}>{widgets.map(w=><div className="setting-row" key={w.id}><span><strong>{w.name}</strong><small className="muted" style={{display:'block'}}>{chatUrl(w.public_key)}</small></span><a className="btn btn-secondary" target="_blank" rel="noreferrer" href={chatUrl(w.public_key)}><ExternalLink size={13}/></a></div>)}</div>
      </section>

      <WebhookPanel />
    </div>
  </div>;
}
