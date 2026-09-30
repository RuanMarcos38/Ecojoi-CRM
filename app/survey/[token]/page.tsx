'use client';
import { FormEvent,useEffect,useState } from 'react';

export default function PublicSurvey({params}:{params:Promise<{token:string}>}){
  const [token,setToken]=useState('');const [data,setData]=useState<any>(null);const [score,setScore]=useState<number|null>(null);const [message,setMessage]=useState('');const [error,setError]=useState('');
  useEffect(()=>{params.then(p=>{setToken(p.token);fetch(`/api/public/surveys/${p.token}`,{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setData(d.data);}).catch(()=>setError('Pesquisa indisponível ou já respondida.'));});},[params]);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(score===null)return;const fd=new FormData(e.currentTarget);const r=await fetch(`/api/public/surveys/${token}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({score,comment:fd.get('comment')})});if(r.ok){setMessage('Obrigado pela sua resposta.');setError('');}else setError('Não foi possível enviar sua resposta.');}
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:20,background:'#f3f5f4'}}>
    <section style={{width:'min(620px,100%)',background:'#fff',border:'1px solid #dfe5e1',borderRadius:10,padding:24}}>
      {error&&<div className="error">{error}</div>}{message?<div className="success">{message}</div>:data&&<><h1 style={{fontSize:24,margin:'0 0 8px'}}>{data.name}</h1><p>{data.question}</p>
      <form onSubmit={submit} style={{display:'grid',gap:14}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(11,1fr)',gap:5}}>{Array.from({length:11},(_,i)=><button type="button" key={i} className={`btn ${score===i?'btn-primary':'btn-secondary'}`} onClick={()=>setScore(i)} style={{padding:'8px 0'}}>{i}</button>)}</div>
        <div className="field"><label>Comentário (opcional)</label><textarea className="textarea" name="comment" rows={4}/></div>
        <button className="btn btn-primary" disabled={score===null}>Enviar avaliação</button>
      </form></>}
    </section>
  </main>;
}
