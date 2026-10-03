'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BookOpenCheck, CheckCircle2, HeartHandshake, Plus, RefreshCw, Search,
  Target, UserPlus, UsersRound
} from 'lucide-react';

type SuccessCase={
  id:string;contact_id?:string|null;deal_id?:string|null;case_type:'onboarding'|'post_sale'|'renewal';
  status:'onboarding'|'in_progress'|'waiting_customer'|'completed'|'cancelled';
  title:string;health_score:number;due_at?:string|null;renewal_at?:string|null;next_action_at?:string|null;notes?:string|null;
  contact?:any;deal?:any;owner?:any;
};
type Question={id:string;field_key:string;label:string;response_type:string;required:boolean;options?:string[];sort_order:number};
type Playbook={id:string;name:string;description?:string|null;entity_type:string;active:boolean;sales_playbook_questions?:Question[]};
type Prospect={id:string;list_name?:string|null;company_name?:string|null;contact_name?:string|null;document?:string|null;website?:string|null;email?:string|null;phone?:string|null;segment?:string|null;city?:string|null;state?:string|null;source:string;status:string;converted_contact_id?:string|null};
type Contact={id:string;name:string};
type Deal={id:string;title:string;stage:string;contact_id?:string|null};
type Member={id:string;full_name:string;active:boolean};

const successStatusLabels:Record<string,string>={
  onboarding:'Onboarding',in_progress:'Em andamento',waiting_customer:'Aguardando cliente',completed:'Concluído',cancelled:'Cancelado'
};
const caseLabels:Record<string,string>={onboarding:'Onboarding',post_sale:'Pós-venda',renewal:'Renovação'};

export default function Relacionamento(){
  const [tab,setTab]=useState<'success'|'playbooks'|'prospects'>('success');
  const [cases,setCases]=useState<SuccessCase[]>([]);
  const [playbooks,setPlaybooks]=useState<Playbook[]>([]);
  const [prospects,setProspects]=useState<Prospect[]>([]);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [deals,setDeals]=useState<Deal[]>([]);
  const [members,setMembers]=useState<Member[]>([]);
  const [runPlaybookId,setRunPlaybookId]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [query,setQuery]=useState('');

  async function load(){
    setError('');
    const [csr,pr,ppr,cr,dr,tr]=await Promise.all([
      fetch('/api/customer-success',{cache:'no-store'}),
      fetch('/api/playbooks',{cache:'no-store'}),
      fetch('/api/prospects',{cache:'no-store'}),
      fetch('/api/contacts',{cache:'no-store'}),
      fetch('/api/deals',{cache:'no-store'}),
      fetch('/api/team',{cache:'no-store'})
    ]);
    const [csd,pd,ppd,cd,dd,td]=await Promise.all([
      csr.json().catch(()=>null),pr.json().catch(()=>null),ppr.json().catch(()=>null),
      cr.json().catch(()=>null),dr.json().catch(()=>null),tr.json().catch(()=>null)
    ]);
    if(csr.ok)setCases(csd?.data??[]);
    if(pr.ok)setPlaybooks(pd?.data??[]);
    if(ppr.ok)setProspects(ppd?.data??[]);
    if(cr.ok)setContacts(cd?.data??[]);
    if(dr.ok)setDeals(dd?.data??[]);
    if(tr.ok)setMembers((td?.data??[]).filter((m:Member)=>m.active));
  }

  useEffect(()=>{void load();},[]);

  const activeCases=useMemo(()=>cases.filter(c=>!['completed','cancelled'].includes(c.status)),[cases]);
  const atRisk=useMemo(()=>activeCases.filter(c=>c.health_score<50).length,[activeCases]);
  const renewals30=useMemo(()=>activeCases.filter(c=>{
    if(!c.renewal_at)return false;
    const time=new Date(c.renewal_at).getTime()-Date.now();
    return time>=0&&time<=30*86400000;
  }).length,[activeCases]);

  const filteredProspects=useMemo(()=>{
    const term=query.trim().toLowerCase();
    return prospects.filter(p=>!term||[p.company_name,p.contact_name,p.email,p.phone,p.segment,p.city,p.state].filter(Boolean).join(' ').toLowerCase().includes(term));
  },[prospects,query]);

  async function createCase(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const formElement=e.currentTarget;const fd=new FormData(formElement);
    const dateValue=(name:string)=>{
      const value=String(fd.get(name)??'').trim();
      return value?new Date(value+'T12:00:00').toISOString():null;
    };
    const response=await fetch('/api/customer-success',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        contact_id:String(fd.get('contact_id')??'')||null,
        deal_id:String(fd.get('deal_id')??'')||null,
        case_type:String(fd.get('case_type')??'post_sale'),
        title:String(fd.get('title')??'').trim(),
        status:'onboarding',
        owner_id:String(fd.get('owner_id')??'')||null,
        health_score:Number(fd.get('health_score')??80),
        due_at:dateValue('due_at'),
        renewal_at:dateValue('renewal_at'),
        next_action_at:dateValue('next_action_at'),
        notes:String(fd.get('notes')??'').trim()||null
      })
    });
    if(response.ok){formElement.reset();setNotice('Caso de relacionamento criado.');await load();}
    else setError('Não foi possível criar o caso.');
  }

  async function updateCase(id:string,patch:Record<string,unknown>){
    const response=await fetch('/api/customer-success/'+id,{
      method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(patch)
    });
    if(response.ok)await load();else setError('Não foi possível atualizar o pós-venda.');
  }

  async function createPlaybook(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const formElement=e.currentTarget;const fd=new FormData(formElement);
    const lines=String(fd.get('questions')??'').split('\n').map(v=>v.trim()).filter(Boolean);
    const questions=lines.map((label,index)=>({
      field_key:'q_'+(index+1),
      label,
      response_type:'text',
      required:true,
      options:[],
      sort_order:index
    }));
    const response=await fetch('/api/playbooks',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        name:String(fd.get('name')??'').trim(),
        description:String(fd.get('description')??'').trim()||null,
        entity_type:String(fd.get('entity_type')??'deal'),
        questions
      })
    });
    if(response.ok){formElement.reset();setNotice('Playbook criado.');await load();}
    else setError('Não foi possível criar o playbook.');
  }

  async function runPlaybook(e:FormEvent<HTMLFormElement>,playbook:Playbook){
    e.preventDefault();setError('');setNotice('');
    const formElement=e.currentTarget;const fd=new FormData(formElement);
    const responses=Object.fromEntries((playbook.sales_playbook_questions??[]).map(q=>[q.field_key,String(fd.get('q__'+q.field_key)??'').trim()]));
    const response=await fetch('/api/playbooks/run',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        playbook_id:playbook.id,
        contact_id:String(fd.get('contact_id')??'')||null,
        deal_id:String(fd.get('deal_id')??'')||null,
        success_case_id:String(fd.get('success_case_id')??'')||null,
        responses
      })
    });
    if(response.ok){setRunPlaybookId('');setNotice('Playbook concluído e registrado no histórico.');}
    else setError('Não foi possível registrar o playbook.');
  }

  async function createProspect(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const formElement=e.currentTarget;const fd=new FormData(formElement);
    const response=await fetch('/api/prospects',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        list_name:String(fd.get('list_name')??'').trim()||null,
        company_name:String(fd.get('company_name')??'').trim()||null,
        contact_name:String(fd.get('contact_name')??'').trim()||null,
        document:String(fd.get('document')??'').trim()||null,
        website:String(fd.get('website')??'').trim()||null,
        email:String(fd.get('email')??'').trim()||null,
        phone:String(fd.get('phone')??'').trim()||null,
        segment:String(fd.get('segment')??'').trim()||null,
        city:String(fd.get('city')??'').trim()||null,
        state:String(fd.get('state')??'').trim()||null,
        source:String(fd.get('source')??'Prospecção').trim()||'Prospecção',
        enrichment:{}
      })
    });
    if(response.ok){formElement.reset();setNotice('Prospect cadastrado.');await load();}
    else setError('Não foi possível cadastrar o prospect.');
  }

  async function convertProspect(id:string){
    const response=await fetch('/api/prospects/'+id+'/convert',{method:'POST'});
    if(response.ok){setNotice('Prospect convertido em contato sem duplicar a base.');await load();}
    else setError('Não foi possível converter o prospect.');
  }

  return <div className="content">
    <div className="page-head">
      <div><h1 className="page-title">Relacionamento</h1><p className="page-sub">Pós-venda, renovação, playbooks e prospecção comercial.</p></div>
      <button className="btn btn-secondary" onClick={()=>void load()}><RefreshCw size={15}/>Atualizar</button>
    </div>

    {error&&<div className="error">{error}</div>}
    {notice&&<div className="success">{notice}</div>}

    <div className="inlineActions" style={{marginBottom:12}}>
      <button className={`btn ${tab==='success'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('success')}><HeartHandshake size={15}/>Pós-venda</button>
      <button className={`btn ${tab==='playbooks'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('playbooks')}><BookOpenCheck size={15}/>Playbooks</button>
      <button className={`btn ${tab==='prospects'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('prospects')}><Target size={15}/>Prospecção</button>
    </div>

    {tab==='success'&&<>
      <section className="report-grid">
        <div><span>Casos ativos</span><strong>{activeCases.length}</strong></div>
        <div><span>Saúde abaixo de 50</span><strong>{atRisk}</strong></div>
        <div><span>Renovações em 30 dias</span><strong>{renewals30}</strong></div>
        <div><span>Concluídos</span><strong>{cases.filter(c=>c.status==='completed').length}</strong></div>
      </section>

      <div className="settings-grid" style={{marginTop:12}}>
        <section className="card section">
          <h3>Novo acompanhamento</h3>
          <form onSubmit={createCase} style={{display:'grid',gap:9}}>
            <div className="form-grid">
              <div className="field"><label>Título</label><input className="input" name="title" required/></div>
              <div className="field"><label>Tipo</label><select className="select" name="case_type"><option value="post_sale">Pós-venda</option><option value="onboarding">Onboarding</option><option value="renewal">Renovação</option></select></div>
              <div className="field"><label>Contato</label><select className="select" name="contact_id" defaultValue=""><option value="">Sem contato</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div className="field"><label>Negócio</label><select className="select" name="deal_id" defaultValue=""><option value="">Sem negócio</option>{deals.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></div>
              <div className="field"><label>Responsável</label><select className="select" name="owner_id" defaultValue=""><option value="">Usuário atual</option>{members.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select></div>
              <div className="field"><label>Saúde (0-100)</label><input className="input" name="health_score" type="number" min="0" max="100" defaultValue="80"/></div>
              <div className="field"><label>Próxima ação</label><input className="input" name="next_action_at" type="date"/></div>
              <div className="field"><label>Prazo</label><input className="input" name="due_at" type="date"/></div>
              <div className="field"><label>Renovação</label><input className="input" name="renewal_at" type="date"/></div>
            </div>
            <div className="field"><label>Notas</label><textarea className="textarea" name="notes" rows={3}/></div>
            <button className="btn btn-primary"><Plus size={14}/>Criar acompanhamento</button>
          </form>
        </section>

        <section className="card section">
          <h3>Carteira de clientes</h3>
          <div style={{display:'grid',gap:8,maxHeight:580,overflow:'auto'}}>
            {cases.length?cases.map(item=>{
              const contact=Array.isArray(item.contact)?item.contact[0]:item.contact;
              return <article key={item.id} style={{border:'1px solid #e4e8e5',borderRadius:6,padding:11,display:'grid',gap:8}}>
                <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
                  <span><strong>{item.title}</strong><small className="muted" style={{display:'block'}}>{caseLabels[item.case_type]} · {contact?.name??'Sem contato'}</small></span>
                  <span className="badge">{item.health_score}/100</span>
                </div>
                <div className="form-grid">
                  <div className="field"><label>Status</label><select className="select" value={item.status} onChange={e=>void updateCase(item.id,{status:e.target.value})}>{Object.entries(successStatusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
                  <div className="field"><label>Saúde</label><input className="input" type="number" min="0" max="100" value={item.health_score} onChange={e=>void updateCase(item.id,{health_score:Number(e.target.value)})}/></div>
                </div>
                {item.renewal_at&&<small className="muted">Renovação: {new Date(item.renewal_at).toLocaleDateString('pt-BR')}</small>}
              </article>;
            }):<p className="muted">Nenhum caso de relacionamento.</p>}
          </div>
        </section>
      </div>
    </>}

    {tab==='playbooks'&&<div className="settings-grid">
      <section className="card section">
        <h3>Novo playbook</h3>
        <form onSubmit={createPlaybook} style={{display:'grid',gap:9}}>
          <div className="form-grid">
            <div className="field"><label>Nome</label><input className="input" name="name" required/></div>
            <div className="field"><label>Uso</label><select className="select" name="entity_type"><option value="deal">Negócios</option><option value="contact">Contatos</option><option value="customer_success">Pós-venda</option></select></div>
          </div>
          <div className="field"><label>Descrição</label><input className="input" name="description"/></div>
          <div className="field"><label>Perguntas — uma por linha</label><textarea className="textarea" name="questions" rows={7} required placeholder={'Qual é a principal necessidade?\nQual orçamento disponível?\nQual prazo esperado?'}/></div>
          <button className="btn btn-primary"><Plus size={14}/>Criar playbook</button>
        </form>
      </section>

      <section className="card section">
        <h3>Playbooks ativos</h3>
        <div style={{display:'grid',gap:9,maxHeight:650,overflow:'auto'}}>
          {playbooks.length?playbooks.map(p=><article key={p.id} style={{border:'1px solid #e4e8e5',borderRadius:6,padding:11}}>
            <div className="automation-top"><span><strong>{p.name}</strong><small className="muted" style={{display:'block'}}>{p.description||p.entity_type}</small></span><button className="btn btn-secondary" onClick={()=>setRunPlaybookId(runPlaybookId===p.id?'':p.id)}>{runPlaybookId===p.id?'Fechar':'Executar'}</button></div>
            {runPlaybookId===p.id&&<form onSubmit={e=>void runPlaybook(e,p)} style={{display:'grid',gap:8,marginTop:10}}>
              <div className="form-grid">
                <div className="field"><label>Contato</label><select className="select" name="contact_id" defaultValue=""><option value="">Sem vínculo</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="field"><label>Negócio</label><select className="select" name="deal_id" defaultValue=""><option value="">Sem vínculo</option>{deals.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></div>
                <div className="field"><label>Pós-venda</label><select className="select" name="success_case_id" defaultValue=""><option value="">Sem vínculo</option>{cases.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
              </div>
              {(p.sales_playbook_questions??[]).sort((a,b)=>a.sort_order-b.sort_order).map(q=><div className="field" key={q.id}><label>{q.label}{q.required?' *':''}</label><input className="input" name={'q__'+q.field_key} required={q.required}/></div>)}
              <button className="btn btn-primary"><CheckCircle2 size={14}/>Concluir playbook</button>
            </form>}
          </article>):<p className="muted">Nenhum playbook cadastrado.</p>}
        </div>
      </section>
    </div>}

    {tab==='prospects'&&<>
      <div className="settings-grid">
        <section className="card section">
          <h3>Novo prospect</h3>
          <form onSubmit={createProspect} style={{display:'grid',gap:9}}>
            <div className="form-grid">
              <div className="field"><label>Lista</label><input className="input" name="list_name"/></div>
              <div className="field"><label>Empresa</label><input className="input" name="company_name"/></div>
              <div className="field"><label>Contato</label><input className="input" name="contact_name"/></div>
              <div className="field"><label>CNPJ / documento</label><input className="input" name="document"/></div>
              <div className="field"><label>Site</label><input className="input" type="url" name="website"/></div>
              <div className="field"><label>E-mail</label><input className="input" type="email" name="email"/></div>
              <div className="field"><label>Telefone</label><input className="input" name="phone"/></div>
              <div className="field"><label>Segmento</label><input className="input" name="segment"/></div>
              <div className="field"><label>Cidade</label><input className="input" name="city"/></div>
              <div className="field"><label>UF</label><input className="input" name="state"/></div>
              <div className="field"><label>Origem</label><input className="input" name="source" defaultValue="Prospecção"/></div>
            </div>
            <button className="btn btn-primary"><UserPlus size={14}/>Adicionar prospect</button>
          </form>
        </section>

        <section className="card section">
          <div className="automation-top"><h3>Base de prospecção</h3><span className="badge">{prospects.length}</span></div>
          <label className="search" style={{width:'100%',marginBottom:10}}><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar prospect..."/></label>
          <div style={{display:'grid',gap:7,maxHeight:590,overflow:'auto'}}>
            {filteredProspects.length?filteredProspects.map(p=><div className="setting-row" key={p.id}>
              <span><strong>{p.company_name||p.contact_name||p.email||p.phone}</strong><small className="muted" style={{display:'block'}}>{[p.contact_name,p.segment,p.city,p.state].filter(Boolean).join(' · ')}</small></span>
              {p.status==='converted'?<span className="badge">Convertido</span>:<button className="btn btn-primary" onClick={()=>void convertProspect(p.id)}><UsersRound size={14}/>Converter</button>}
            </div>):<p className="muted">Nenhum prospect cadastrado.</p>}
          </div>
        </section>
      </div>
    </>}
  </div>;
}
