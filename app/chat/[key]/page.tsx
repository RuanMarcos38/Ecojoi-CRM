'use client';
import { FormEvent,useEffect,useState } from 'react';

export default function PublicChat({params}:{params:Promise<{key:string}>}){
  const [key,setKey]=useState('');const [config,setConfig]=useState<any>(null);const [session,setSession]=useState('');const [messages,setMessages]=useState<any[]>([]);const [error,setError]=useState('');
  useEffect(()=>{params.then(p=>{setKey(p.key);fetch(`/api/public/chat/${p.key}`,{cache:'no-store'}).then(r=>r.json()).then(d=>setConfig(d.data??null)).catch(()=>setError('Chat indisponível.'));});},[params]);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const fd=new FormData(e.currentTarget);const r=await fetch(`/api/public/chat/${key}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session:session||null,name:fd.get('name'),email:fd.get('email'),phone:fd.get('phone'),body:fd.get('body')})});const d=await r.json().catch(()=>null);if(r.ok){setSession(d.data.session);setMessages(d.data.messages??[]);e.currentTarget.reset();}else setError('Não foi possível enviar.');}
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:20,background:'#f3f5f4'}}>
    <section style={{width:'min(520px,100%)',background:'#fff',border:'1px solid #dfe5e1',borderRadius:10,overflow:'hidden'}}>
      <header style={{padding:16,borderBottom:'1px solid #e4e8e5'}}><strong>{config?.name||'Atendimento'}</strong><div style={{fontSize:12,color:'#6b756f'}}>{config?.welcome_message}</div></header>
      <div style={{height:320,overflow:'auto',padding:14,background:'#f7f8f7'}}>{messages.map(m=><div key={m.id} style={{margin:'7px 0',textAlign:m.direction==='visitor'?'right':'left'}}><span style={{display:'inline-block',maxWidth:'80%',padding:'8px 10px',borderRadius:7,background:m.direction==='visitor'?'#d9fdd3':'#fff',border:'1px solid #e4e8e5'}}>{m.body}</span></div>)}</div>
      {error&&<div className="error">{error}</div>}
      <form onSubmit={submit} style={{padding:12,display:'grid',gap:8}}>
        {!session&&<div className="form-grid"><input className="input" name="name" placeholder="Seu nome" required/><input className="input" name="email" type="email" placeholder="E-mail"/></div>}
        {!session&&<input className="input" name="phone" placeholder="Telefone"/>}
        <div style={{display:'flex',gap:8}}><input className="input" name="body" placeholder="Digite sua mensagem" required/><button className="btn btn-primary">Enviar</button></div>
      </form>
    </section>
  </main>;
}
