'use client';
import { FormEvent,useEffect,useState } from 'react';

export default function PublicBooking({params}:{params:Promise<{tenant:string;slug:string}>}){
  const [route,setRoute]=useState<{tenant:string;slug:string}|null>(null);
  const [data,setData]=useState<any>(null);
  const [message,setMessage]=useState('');const [error,setError]=useState('');
  useEffect(()=>{params.then(p=>{setRoute(p);fetch(`/api/public/book/${p.tenant}/${p.slug}`,{cache:'no-store'}).then(r=>r.json()).then(d=>setData(d.data??null)).catch(()=>setError('Agendamento indisponível.'));});},[params]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!route)return;const formElement=e.currentTarget;const fd=new FormData(formElement);
    const r=await fetch(`/api/public/book/${route.tenant}/${route.slug}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      name:fd.get('name'),email:fd.get('email'),phone:fd.get('phone'),starts_at:fd.get('starts_at'),notes:fd.get('notes')
    })});
    if(r.ok){setMessage('Agendamento confirmado.');setError('');formElement.reset();}else{const d=await r.json().catch(()=>null);setError(d?.error==='slot_unavailable'?'Este horário acabou de ser ocupado. Escolha outro.':'Não foi possível agendar.');}
  }
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:20,background:'#f3f5f4'}}>
    <section style={{width:'min(560px,100%)',background:'#fff',border:'1px solid #dfe5e1',borderRadius:10,padding:24}}>
      {!data?<p>Carregando...</p>:<><h1 style={{margin:'0 0 6px',fontSize:26}}>{data.name}</h1><p style={{color:'#6b756f'}}>{data.duration_minutes} minutos · {data.timezone}</p>
      {error&&<div className="error">{error}</div>}{message&&<div className="success">{message}</div>}
      <form onSubmit={submit} style={{display:'grid',gap:12,marginTop:18}}>
        <div className="field"><label>Nome</label><input className="input" name="name" required/></div>
        <div className="form-grid"><div className="field"><label>E-mail</label><input className="input" type="email" name="email"/></div><div className="field"><label>Telefone</label><input className="input" name="phone"/></div></div>
        <div className="field"><label>Data e horário</label><input className="input" type="datetime-local" name="starts_at" required/></div>
        <div className="field"><label>Observações</label><textarea className="textarea" name="notes" rows={3}/></div>
        <button className="btn btn-primary">Confirmar agendamento</button>
      </form></>}
    </section>
  </main>;
}
