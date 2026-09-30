'use client';

import { FormEvent, useEffect, useState } from 'react';
import { MessageSquareText, Plus } from 'lucide-react';

type QuickReply={id:string;shortcut:string;title:string;body:string;active:boolean;updated_at:string};

export function QuickRepliesPanel({enabled}:{enabled:boolean}){
  const [rows,setRows]=useState<QuickReply[]>([]);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  async function load(){
    if(!enabled)return;
    const r=await fetch('/api/quick-replies',{cache:'no-store'});
    const d=await r.json().catch(()=>null);
    if(r.ok)setRows(d?.data??[]);
  }
  useEffect(()=>{void load();},[enabled]);

  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const fd=new FormData(e.currentTarget);
    const r=await fetch('/api/quick-replies',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        shortcut:String(fd.get('shortcut')??'').trim(),
        title:String(fd.get('title')??'').trim(),
        body:String(fd.get('body')??'').trim()
      })
    });
    if(r.ok){e.currentTarget.reset();setNotice('Resposta rápida salva.');await load();}
    else setError('Não foi possível salvar a resposta rápida.');
  }

  if(!enabled)return null;

  return <section className="card section">
    <div className="automation-top">
      <div><h3 style={{marginBottom:4}}>Respostas rápidas</h3><p className="muted" style={{margin:0}}>No Atendimento, digite /atalho para inserir a mensagem.</p></div>
      <MessageSquareText size={21}/>
    </div>
    {error&&<div className="error" style={{marginTop:10}}>{error}</div>}
    {notice&&<div className="success" style={{marginTop:10}}>{notice}</div>}

    <form onSubmit={save} style={{display:'grid',gap:9,marginTop:12}}>
      <div className="form-grid">
        <div className="field"><label>Atalho</label><input className="input" name="shortcut" placeholder="/catalogo" required/></div>
        <div className="field"><label>Título</label><input className="input" name="title" placeholder="Enviar catálogo" required/></div>
      </div>
      <div className="field"><label>Mensagem</label><textarea className="textarea" name="body" rows={4} required/></div>
      <button className="btn btn-primary"><Plus size={14}/>Salvar resposta</button>
    </form>

    <div style={{display:'grid',gap:7,marginTop:12,maxHeight:240,overflow:'auto'}}>
      {rows.length?rows.map(row=><div className="setting-row" key={row.id}>
        <span><strong>/{row.shortcut.replace(/^\//,'')}</strong><small className="muted" style={{display:'block'}}>{row.title}</small></span>
        <small className="muted">{row.body.slice(0,72)}{row.body.length>72?'…':''}</small>
      </div>):<p className="muted">Nenhuma resposta rápida cadastrada.</p>}
    </div>
  </section>;
}
