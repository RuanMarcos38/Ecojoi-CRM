'use client';

import { FormEvent,useEffect,useState } from 'react';

type Proposal={proposal_number?:string|null;title:string;status:string;currency:string;subtotal:number;discount_percent:number;discount_value:number;total:number;valid_until?:string|null;notes?:string|null;terms?:string|null;contact?:any;items:any[]};

function money(v:number){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

export default function ProposalPublic({params}:{params:Promise<{token:string}>}){
  const [token,setToken]=useState('');
  const [data,setData]=useState<Proposal|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  useEffect(()=>{params.then(p=>{setToken(p.token);fetch('/api/public/proposals/'+encodeURIComponent(p.token),{cache:'no-store'}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error);setData(j.data);}).catch(()=>setError('Proposta não encontrada.'));});},[params]);

  async function act(e:FormEvent<HTMLFormElement>,action:'accept'|'reject'){
    e.preventDefault();if(!token)return;const fd=new FormData(e.currentTarget);
    const r=await fetch('/api/public/proposals/'+encodeURIComponent(token),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,name:fd.get('name')||undefined,email:fd.get('email')||undefined})});
    const j=await r.json().catch(()=>null);
    if(r.ok){setNotice(action==='accept'?'Proposta aceita com sucesso.':'Proposta recusada.');setData(d=>d?{...d,status:action==='accept'?'accepted':'rejected'}:d);}else setError(j?.error==='proposal_expired'?'Esta proposta expirou.':'Não foi possível registrar a resposta.');
  }

  if(error&&!data)return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'Inter,Arial',background:'#f5f7f5'}}><div style={{background:'#fff',padding:28,border:'1px solid #e1e5e2',borderRadius:10}}>{error}</div></main>;
  if(!data)return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'Inter,Arial'}}>Carregando proposta...</main>;

  return <main style={{minHeight:'100vh',background:'#f5f7f5',padding:'28px 14px',fontFamily:'Inter,Arial',color:'#17211d'}}>
    <section style={{maxWidth:820,margin:'0 auto',background:'#fff',border:'1px solid #e1e5e2',borderRadius:10,padding:28}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:18,alignItems:'flex-start',borderBottom:'1px solid #edf0ee',paddingBottom:18}}>
        <div><small style={{color:'#6f7a75'}}>PROPOSTA {data.proposal_number||''}</small><h1 style={{fontSize:26,margin:'6px 0'}}>{data.title}</h1><p style={{margin:0,color:'#6f7a75'}}>Validade: {data.valid_until?new Date(data.valid_until+'T12:00:00').toLocaleDateString('pt-BR'):'não informada'}</p></div>
        <strong style={{padding:'6px 10px',borderRadius:6,background:'#edf8f0',color:'#087a4b',fontSize:12}}>{data.status.toUpperCase()}</strong>
      </div>

      <div style={{marginTop:20,overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['Item','Qtd.','Valor unit.','Total'].map(h=><th key={h} style={{textAlign:'left',padding:'9px 8px',borderBottom:'1px solid #e7ebe8',fontSize:11,color:'#6f7a75'}}>{h}</th>)}</tr></thead><tbody>
        {[...(data.items||[])].sort((a,b)=>a.sort_order-b.sort_order).map(i=><tr key={i.id}><td style={{padding:'11px 8px',borderBottom:'1px solid #edf0ee'}}>{i.description}</td><td style={{padding:'11px 8px',borderBottom:'1px solid #edf0ee'}}>{i.quantity}</td><td style={{padding:'11px 8px',borderBottom:'1px solid #edf0ee'}}>{money(i.unit_price)}</td><td style={{padding:'11px 8px',borderBottom:'1px solid #edf0ee'}}>{money(i.line_total)}</td></tr>)}
      </tbody></table></div>

      <div style={{marginLeft:'auto',maxWidth:320,marginTop:18,display:'grid',gap:7}}>
        <div style={{display:'flex',justifyContent:'space-between'}}><span>Subtotal</span><strong>{money(data.subtotal)}</strong></div>
        <div style={{display:'flex',justifyContent:'space-between'}}><span>Desconto</span><strong>{money(data.discount_value)}</strong></div>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:20,paddingTop:10,borderTop:'1px solid #e1e5e2'}}><span>Total</span><strong>{money(data.total)}</strong></div>
      </div>

      {data.notes&&<div style={{marginTop:20}}><h3>Observações</h3><p style={{whiteSpace:'pre-wrap'}}>{data.notes}</p></div>}
      {data.terms&&<div style={{marginTop:20}}><h3>Condições</h3><p style={{whiteSpace:'pre-wrap'}}>{data.terms}</p></div>}
      {notice&&<div style={{marginTop:18,padding:12,borderRadius:7,background:'#edf8f0',color:'#087a4b'}}>{notice}</div>}
      {error&&<div style={{marginTop:18,padding:12,borderRadius:7,background:'#fff2f0',color:'#b42318'}}>{error}</div>}

      {!['accepted','rejected','expired'].includes(data.status)&&<form onSubmit={e=>void act(e,'accept')} style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9,marginTop:22}}>
        <input name="name" required placeholder="Seu nome" style={{padding:10,border:'1px solid #d4dad6',borderRadius:6}}/>
        <input name="email" type="email" required placeholder="Seu e-mail" style={{padding:10,border:'1px solid #d4dad6',borderRadius:6}}/>
        <button style={{gridColumn:'span 1',padding:11,border:0,borderRadius:6,background:'#087a4b',color:'#fff',fontWeight:700,cursor:'pointer'}}>Aceitar proposta</button>
        <button type="button" onClick={()=>{const form=document.querySelector('form') as HTMLFormElement|null;if(form)void act({preventDefault(){},currentTarget:form} as any,'reject');}} style={{padding:11,border:'1px solid #d4dad6',borderRadius:6,background:'#fff',color:'#b42318',fontWeight:700,cursor:'pointer'}}>Recusar</button>
      </form>}
    </section>
  </main>;
}
