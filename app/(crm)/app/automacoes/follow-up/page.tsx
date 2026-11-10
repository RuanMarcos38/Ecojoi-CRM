'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

type Contact = { id:string; name:string; phone:string|null; status:string; consent_status?:string|null };
type Sequence = { id:string; name:string; active:boolean };

export default function FollowUp() {
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [sequences,setSequences]=useState<Sequence[]>([]);
  const [contactId,setContactId]=useState('');
  const [sequenceId,setSequenceId]=useState('');
  const [name,setName]=useState('Reativação de contatos inativos');
  const [message,setMessage]=useState('Olá, {{nome}}! Tudo bem? Podemos retomar nossa conversa?');
  const [hours,setHours]=useState(24);
  const [loading,setLoading]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');

  async function load() {
    const [contactsRes,sequencesRes]=await Promise.all([
      fetch('/api/contacts?status=inactive',{cache:'no-store'}),
      fetch('/api/sequences',{cache:'no-store'})
    ]);
    if(!contactsRes.ok || !sequencesRes.ok) {
      setError('Sem permissão ou não foi possível carregar os contatos e as sequências.');
      return;
    }
    const [c,s]=await Promise.all([contactsRes.json(),sequencesRes.json()]);
    setContacts((c.data??[]).filter((x:Contact)=>x.phone && x.consent_status==='opt_in'));
    setSequences((s.data??[]).filter((x:Sequence)=>x.active));
  }
  useEffect(()=>{void load();},[]);

  async function create(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setLoading(true);setError('');setNotice('');
    try {
      const r=await fetch('/api/sequences',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({
          name,active:true,
          description:'Follow-up por WhatsApp para contatos inativos que autorizaram mensagens.',
          steps:[{delay_minutes:hours*60,action_type:'whatsapp',template_body:message}]
        })
      });
      if(!r.ok)throw new Error('Não foi possível criar a sequência.');
      const payload=await r.json();
      setNotice('Sequência criada. Inscreva um contato autorizado para agendar o envio.');
      setSequenceId(payload.data.id);
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Erro ao salvar sequência.');}
    finally{setLoading(false);}
  }

  async function enroll(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setLoading(true);setError('');setNotice('');
    const selected=contacts.find(c=>c.id===contactId);
    if(!selected || selected.consent_status!=='opt_in' || !selected.phone){
      setLoading(false);setError('Selecione um contato inativo com telefone e opt-in registrado.');return;
    }
    try{
      const r=await fetch('/api/sequences/enroll',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({sequence_id:sequenceId,contact_id:contactId})
      });
      if(!r.ok)throw new Error('Falha ao inscrever. Verifique se o contato já está inscrito.');
      setNotice('Contato inscrito na sequência. O envio depende do worker e do provedor WhatsApp configurados.');
    }catch(e){setError(e instanceof Error?e.message:'Erro ao inscrever contato.');}
    finally{setLoading(false);}
  }

  return <main className="content">
    <div className="page-head"><div>
      <h1 className="page-title">Follow-up · Reativação</h1>
      <p className="page-sub">Sequências agendadas para contatos inativos que autorizaram comunicação por WhatsApp.</p>
    </div><Link className="btn btn-secondary" href="/app/automacoes">Voltar</Link></div>
    {error && <div className="error" role="alert">{error}</div>}
    {notice && <div className="success" role="status">{notice}</div>}
    <section className="card section">
      <h2>Criar sequência</h2>
      <form className="form-grid" onSubmit={create}>
        <div className="field"><label htmlFor="sequence-name">Nome</label>
          <input id="sequence-name" className="input" required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></div>
        <div className="field"><label htmlFor="sequence-hours">Esperar (horas)</label>
          <input id="sequence-hours" className="input" type="number" min={1} max={8760} value={hours} onChange={e=>setHours(Number(e.target.value))}/></div>
        <div className="field" style={{gridColumn:'1 / -1'}}><label htmlFor="sequence-message">Mensagem</label>
          <textarea id="sequence-message" className="input" required maxLength={4000} rows={4} value={message} onChange={e=>setMessage(e.target.value)}/></div>
        <div><button className="btn btn-primary" disabled={loading||!Number.isInteger(hours)||hours<1||hours>8760}>Criar sequência</button></div>
      </form>
    </section>
    <section className="card section">
      <h2>Inscrever contato inativo</h2>
      <p className="muted">Somente contatos com telefone e consentimento opt-in aparecem aqui. Verifique também as regras de janela de atendimento e templates aprovados pelo provedor.</p>
      <form className="form-grid" onSubmit={enroll}>
        <div className="field"><label htmlFor="followup-sequence">Sequência</label>
          <select id="followup-sequence" className="select" required value={sequenceId} onChange={e=>setSequenceId(e.target.value)}>
            <option value="">Selecione</option>{sequences.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>
        <div className="field"><label htmlFor="followup-contact">Contato autorizado</label>
          <select id="followup-contact" className="select" required value={contactId} onChange={e=>setContactId(e.target.value)}>
            <option value="">Selecione</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
          </select></div>
        <div><button className="btn btn-primary" disabled={loading||!sequenceId||!contactId}>Agendar follow-up</button></div>
      </form>
    </section>
  </main>;
}
