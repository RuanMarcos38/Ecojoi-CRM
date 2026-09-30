'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

function money(value:number){return Number(value??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

export default function ProposalPage({params}:{params:Promise<{token:string}>}){
  const [token,setToken]=useState('');
  const [proposal,setProposal]=useState<any>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');

  useEffect(()=>{params.then(async p=>{
    setToken(p.token);
    const r=await fetch(`/api/public/proposals/${p.token}`,{cache:'no-store'});
    const d=await r.json().catch(()=>null);
    if(r.ok)setProposal(d?.data??null);else setError('Proposta indisponível.');
  });},[params]);

  async function respond(action:'accept'|'reject'){
    setError('');setNotice('');
    const r=await fetch(`/api/public/proposals/${token}`,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({action,name,email})
    });
    if(r.ok){
      const status=action==='accept'?'accepted':'rejected';
      setNotice(action==='accept'?'Proposta aceita com sucesso.':'Proposta recusada.');
      setProposal((p:any)=>({...p,status}));
    }else setError('Não foi possível registrar sua resposta.');
  }

  function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();void respond('accept');}

  return <main style={{minHeight:'100vh',padding:20,background:'#f3f5f4'}}>
    <section style={{width:'min(820px,100%)',margin:'30px auto',background:'#fff',border:'1px solid #dfe5e1',borderRadius:10,padding:28}}>
      {error&&<div className="error">{error}</div>}
      {!proposal&&!error&&<p>Carregando proposta...</p>}
      {proposal&&<>
        <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'start',borderBottom:'1px solid #e5e9e7',paddingBottom:18}}>
          <div><small className="muted">{proposal.proposal_number}</small><h1 style={{margin:'4px 0 0',fontSize:28}}>{proposal.title}</h1></div>
          <span className="badge">{proposal.status}</span>
        </div>

        <div className="table-wrap" style={{marginTop:20}}>
          <table className="table"><thead><tr><th>Item</th><th>Qtd.</th><th>Valor unit.</th><th>Total</th></tr></thead><tbody>
            {(proposal.proposal_items??[]).map((item:any,i:number)=><tr key={i}><td>{item.description}</td><td>{item.quantity}</td><td>{money(item.unit_price)}</td><td>{money(item.line_total)}</td></tr>)}
          </tbody></table>
        </div>

        <div style={{display:'grid',justifyContent:'end',gap:5,marginTop:18,textAlign:'right'}}>
          <span>Subtotal: <strong>{money(proposal.subtotal)}</strong></span>
          <span>Descontos: <strong>{money(proposal.discount_value)}</strong></span>
          <span style={{fontSize:22}}>Total: <strong>{money(proposal.total)}</strong></span>
        </div>

        {proposal.valid_until&&<p className="muted">Validade: {new Date(proposal.valid_until+'T00:00:00').toLocaleDateString('pt-BR')}</p>}
        {proposal.notes&&<div style={{whiteSpace:'pre-wrap',marginTop:16}}>{proposal.notes}</div>}
        {notice&&<div className="success">{notice}</div>}

        {['approved','sent'].includes(proposal.status)&&<form onSubmit={submit} style={{display:'grid',gap:10,marginTop:24,borderTop:'1px solid #e5e9e7',paddingTop:18}}>
          <div className="form-grid">
            <div className="field"><label>Seu nome</label><input className="input" value={name} onChange={e=>setName(e.target.value)} required/></div>
            <div className="field"><label>Seu e-mail</label><input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div>
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button type="button" className="btn btn-secondary" onClick={()=>void respond('reject')}><XCircle size={15}/>Recusar</button>
            <button className="btn btn-primary"><CheckCircle2 size={15}/>Aceitar proposta</button>
          </div>
        </form>}
      </>}
    </section>
  </main>;
}
