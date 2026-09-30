'use client';

import { FormEvent,useEffect,useState } from 'react';
import { ClipboardList,Plus,Save } from 'lucide-react';

type Playbook={id:string;name:string;entity_type:string;active:boolean;questions:Array<{id:string;label:string;field_key:string;response_type:string;required:boolean}>};
type Contact={id:string;name:string};

export default function Playbooks(){
  const [playbooks,setPlaybooks]=useState<Playbook[]>([]);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');

  async function load(){
    const [pr,cr]=await Promise.all([fetch('/api/playbooks',{cache:'no-store'}),fetch('/api/contacts?status=lead',{cache:'no-store'})]);
    const [pd,cd]=await Promise.all([pr.json(),cr.json()]);
    if(pr.ok)setPlaybooks(pd.data??[]);
    if(cr.ok)setContacts(cd.data??[]);
  }
  useEffect(()=>{void load();},[]);

  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const fd=new FormData(e.currentTarget);
    const questions=[
      {label:String(fd.get('q1')||'Necessidade'),field_key:'necessidade',response_type:'text',required:true,options:[]},
      {label:String(fd.get('q2')||'Orçamento'),field_key:'orcamento',response_type:'text',required:false,options:[]},
      {label:String(fd.get('q3')||'Prazo'),field_key:'prazo',response_type:'text',required:false,options:[]}
    ];
    const r=await fetch('/api/playbooks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:fd.get('name'),entity_type:'contact',questions})});
    if(r.ok){setNotice('Playbook criado.');e.currentTarget.reset();await load();}else setError('Não foi possível criar o playbook.');
  }

  async function answer(e:FormEvent<HTMLFormElement>,playbook:Playbook){
    e.preventDefault();setError('');setNotice('');
    const fd=new FormData(e.currentTarget);const contactId=String(fd.get('contact_id')||'');
    const answers:Record<string,unknown>={};
    for(const q of playbook.questions)answers[q.field_key]=fd.get(q.field_key);
    const r=await fetch('/api/playbooks',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({playbook_id:playbook.id,contact_id:contactId,deal_id:null,answers})});
    if(r.ok){setNotice('Qualificação registrada.');e.currentTarget.reset();}else setError('Não foi possível salvar a qualificação.');
  }

  return <div className="content">
    <div className="page-head"><div><h1 className="page-title">Playbooks comerciais</h1><p className="page-sub">Roteiros estruturados para qualificação consistente da equipe.</p></div></div>
    {error&&<div className="error">{error}</div>}{notice&&<div className="success">{notice}</div>}

    <form className="card section" onSubmit={create}>
      <h3>Novo playbook</h3>
      <div className="form-grid">
        <div className="field"><label>Nome</label><input className="input" name="name" required placeholder="Qualificação comercial"/></div>
        <div className="field"><label>Pergunta 1</label><input className="input" name="q1" defaultValue="Qual é a necessidade principal?"/></div>
        <div className="field"><label>Pergunta 2</label><input className="input" name="q2" defaultValue="Qual o orçamento disponível?"/></div>
        <div className="field"><label>Pergunta 3</label><input className="input" name="q3" defaultValue="Qual o prazo para decisão?"/></div>
      </div>
      <button className="btn btn-primary" style={{marginTop:12}}><Plus size={14}/>Criar playbook</button>
    </form>

    <div className="settings-grid">
      {playbooks.map(p=><section className="card section" key={p.id}>
        <div className="automation-top"><h3 style={{margin:0}}><ClipboardList size={16}/> {p.name}</h3><span className="badge">{p.questions.length} perguntas</span></div>
        <form onSubmit={e=>void answer(e,p)} style={{display:'grid',gap:9,marginTop:12}}>
          <div className="field"><label>Lead/Contato</label><select className="select" name="contact_id" required defaultValue=""><option value="" disabled>Selecione</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          {p.questions.map(q=><div className="field" key={q.id}><label>{q.label}</label><input className="input" name={q.field_key} required={q.required}/></div>)}
          <button className="btn btn-primary"><Save size={14}/>Salvar qualificação</button>
        </form>
      </section>)}
      {!playbooks.length&&<div className="card empty">Nenhum playbook disponível.</div>}
    </div>
  </div>;
}
