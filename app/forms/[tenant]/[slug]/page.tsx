'use client';
import { FormEvent,useEffect,useState } from 'react';

export default function PublicForm({params}:{params:Promise<{tenant:string;slug:string}>}){
  const [route,setRoute]=useState<{tenant:string;slug:string}|null>(null);
  const [form,setForm]=useState<any>(null);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{params.then(p=>{setRoute(p);fetch(`/api/public/forms/${p.tenant}/${p.slug}`,{cache:'no-store'}).then(r=>r.json()).then(d=>setForm(d.data??null)).catch(()=>setError('Formulário indisponível.'));});},[params]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!route)return;setError('');setMessage('');
    const formElement=e.currentTarget;const fd=new FormData(formElement);const body:Object=Object.fromEntries(fd.entries());
    const r=await fetch(`/api/public/forms/${route.tenant}/${route.slug}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json().catch(()=>null);
    if(r.ok){setMessage(d?.data?.message??'Enviado com sucesso.');formElement.reset();}else setError('Não foi possível enviar.');
  }
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:20,background:'#f3f5f4'}}>
    <section style={{width:'min(560px,100%)',background:'#fff',border:'1px solid #dfe5e1',borderRadius:10,padding:24}}>
      {!form?<p>Carregando...</p>:<><h1 style={{margin:'0 0 6px',fontSize:26}}>{form.title}</h1>{form.description&&<p style={{color:'#6b756f'}}>{form.description}</p>}
      {error&&<div className="error">{error}</div>}{message&&<div className="success">{message}</div>}
      <form onSubmit={submit} style={{display:'grid',gap:12,marginTop:18}}>
        {(form.fields??[]).map((f:any)=><div className="field" key={f.name}><label>{f.label}</label>{f.type==='textarea'?<textarea className="textarea" name={f.name} required={f.required} rows={4}/>:<input className="input" name={f.name} type={f.type||'text'} required={f.required}/>}</div>)}
        <button className="btn btn-primary">Enviar</button>
      </form></>}
    </section>
  </main>;
}
