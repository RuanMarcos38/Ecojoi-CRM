'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Boxes, ClipboardList, FileText, Plus, RefreshCw, Send, Star } from 'lucide-react';

type Product={id:string;sku?:string|null;name:string;description?:string|null;unit?:string|null;price:number;cost?:number|null;active:boolean};
type Proposal={id:string;proposal_number?:string|null;public_token?:string|null;title:string;status:string;subtotal:number;discount_percent?:number;discount_value?:number;total:number;valid_until?:string|null;contact?:any;proposal_items?:Array<any>};
type Sequence={id:string;name:string;description?:string|null;active:boolean;sales_sequence_steps?:Array<any>};
type Survey={id:string;name:string;survey_type:'nps'|'csat';question:string;active:boolean;customer_survey_responses?:Array<{score:number}>};
type Contact={id:string;name:string};

function money(value:number){return Number(value??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

export default function Vendas(){
  const [tab,setTab]=useState<'catalogo'|'propostas'|'sequencias'|'pesquisas'>('catalogo');
  const [products,setProducts]=useState<Product[]>([]);
  const [proposals,setProposals]=useState<Proposal[]>([]);
  const [sequences,setSequences]=useState<Sequence[]>([]);
  const [surveys,setSurveys]=useState<Survey[]>([]);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  async function load(){
    setError('');
    const [pr,por,sr,svr,cr]=await Promise.all([
      fetch('/api/products',{cache:'no-store'}),
      fetch('/api/proposals',{cache:'no-store'}),
      fetch('/api/sequences',{cache:'no-store'}),
      fetch('/api/surveys',{cache:'no-store'}),
      fetch('/api/contacts',{cache:'no-store'})
    ]);
    const [pd,pod,sd,svd,cd]=await Promise.all([
      pr.json().catch(()=>null),por.json().catch(()=>null),sr.json().catch(()=>null),svr.json().catch(()=>null),cr.json().catch(()=>null)
    ]);
    if(pr.ok)setProducts(pd?.data??[]);
    if(por.ok)setProposals(pod?.data??[]);
    if(sr.ok)setSequences(sd?.data??[]);
    if(svr.ok)setSurveys(svd?.data??[]);
    if(cr.ok)setContacts(cd?.data??[]);
  }

  useEffect(()=>{void load();},[]);

  async function createProduct(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const formElement=e.currentTarget;const fd=new FormData(formElement);
    const r=await fetch('/api/products',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      sku:String(fd.get('sku')??'').trim()||null,
      name:String(fd.get('name')??'').trim(),
      description:String(fd.get('description')??'').trim()||null,
      unit:String(fd.get('unit')??'').trim()||null,
      price:Number(fd.get('price')??0),
      cost:String(fd.get('cost')??'').trim()?Number(fd.get('cost')):null,
      active:true
    })});
    if(r.ok){formElement.reset();setNotice('Produto/serviço adicionado ao catálogo.');await load();}
    else setError('Não foi possível salvar o produto.');
  }

  async function createProposal(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const formElement=e.currentTarget;const fd=new FormData(formElement);
    const product=products.find(p=>p.id===String(fd.get('product_id')??''));
    const quantity=Number(fd.get('quantity')??1);
    const unitPrice=Number(fd.get('unit_price')??product?.price??0);
    const r=await fetch('/api/proposals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      contact_id:String(fd.get('contact_id')??'')||null,
      title:String(fd.get('title')??'').trim(),
      valid_until:String(fd.get('valid_until')??'')||null,
      notes:String(fd.get('notes')??'').trim()||null,
      discount:Number(fd.get('discount')??0),
      items:[{
        product_id:product?.id??null,
        description:product?.name||String(fd.get('item_description')??'Item'),
        quantity,
        unit_price:unitPrice,
        discount:0
      }]
    })});
    if(r.ok){formElement.reset();setNotice('Proposta criada.');await load();}
    else setError('Não foi possível criar a proposta.');
  }

  async function proposalAction(proposal:Proposal,action:'submit_approval'|'approve'|'send'|'reject'){
    setError('');setNotice('');
    const r=await fetch(`/api/proposals/${proposal.id}`,{
      method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action})
    });
    const d=await r.json().catch(()=>null);
    if(!r.ok){
      const messages:Record<string,string>={
        approval_requires_manager:'Somente gestor ou administrador pode aprovar propostas.',
        discounted_proposal_requires_approval:'Propostas com desconto precisam de aprovação antes do envio.',
        invalid_status_transition:'Esta mudança de status não é válida.'
      };
      setError(messages[d?.error]??'Não foi possível atualizar a proposta.');
      return;
    }
    if(action==='send'&&d?.data?.public_url)setNotice(`Proposta pronta para envio: ${d.data.public_url}`);
    else setNotice('Proposta atualizada.');
    await load();
  }

  async function createSequence(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const formElement=e.currentTarget;const fd=new FormData(formElement);
    const r=await fetch('/api/sequences',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      name:String(fd.get('name')??'').trim(),
      description:String(fd.get('description')??'').trim()||null,
      active:true,
      steps:[
        {delay_minutes:Number(fd.get('delay1')??0),action_type:String(fd.get('action1')??'task'),template_body:String(fd.get('body1')??'').trim()||null},
        {delay_minutes:Number(fd.get('delay2')??1440),action_type:String(fd.get('action2')??'whatsapp'),template_body:String(fd.get('body2')??'').trim()||null}
      ]
    })});
    if(r.ok){formElement.reset();setNotice('Sequência criada.');await load();}
    else setError('Não foi possível criar a sequência.');
  }

  async function createSurvey(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const formElement=e.currentTarget;const fd=new FormData(formElement);
    const r=await fetch('/api/surveys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      name:String(fd.get('name')??'').trim(),
      survey_type:String(fd.get('survey_type')??'nps'),
      question:String(fd.get('question')??'').trim(),
      active:true
    })});
    if(r.ok){formElement.reset();setNotice('Pesquisa criada.');await load();}
    else setError('Não foi possível criar a pesquisa.');
  }

  const proposalTotal=useMemo(()=>proposals.reduce((sum,p)=>sum+Number(p.total??0),0),[proposals]);

  return <div className="content">
    <div className="page-head">
      <div><h1 className="page-title">Operações Comerciais</h1><p className="page-sub">Catálogo, propostas, cadências e experiência do cliente.</p></div>
      <button className="btn btn-secondary" onClick={()=>void load()}><RefreshCw size={15}/>Atualizar</button>
    </div>

    {error&&<div className="error">{error}</div>}
    {notice&&<div className="success">{notice}</div>}

    <div className="inlineActions" style={{marginBottom:12}}>
      <button className={`btn ${tab==='catalogo'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('catalogo')}><Boxes size={14}/>Catálogo</button>
      <button className={`btn ${tab==='propostas'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('propostas')}><FileText size={14}/>Propostas</button>
      <button className={`btn ${tab==='sequencias'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('sequencias')}><Send size={14}/>Sequências</button>
      <button className={`btn ${tab==='pesquisas'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('pesquisas')}><Star size={14}/>NPS/CSAT</button>
    </div>

    {tab==='catalogo'&&<div className="settings-grid">
      <section className="card section">
        <h3>Novo produto ou serviço</h3>
        <form onSubmit={createProduct} style={{display:'grid',gap:9}}>
          <div className="form-grid">
            <div className="field"><label>SKU</label><input className="input" name="sku"/></div>
            <div className="field"><label>Nome</label><input className="input" name="name" required/></div>
            <div className="field"><label>Unidade</label><input className="input" name="unit" placeholder="un, hora, pacote..."/></div>
            <div className="field"><label>Preço</label><input className="input" name="price" type="number" step="0.01" min="0" required/></div>
            <div className="field"><label>Custo</label><input className="input" name="cost" type="number" step="0.01" min="0"/></div>
          </div>
          <div className="field"><label>Descrição</label><textarea className="textarea" name="description" rows={3}/></div>
          <button className="btn btn-primary"><Plus size={14}/>Adicionar ao catálogo</button>
        </form>
      </section>
      <section className="card section">
        <h3>Catálogo</h3>
        <div className="table-wrap" style={{maxHeight:430}}>
          <table className="table"><thead><tr><th>SKU</th><th>Item</th><th>Preço</th><th>Status</th></tr></thead><tbody>
            {products.length?products.map(p=><tr key={p.id}><td>{p.sku||'—'}</td><td>{p.name}</td><td>{money(p.price)}</td><td>{p.active?'Ativo':'Inativo'}</td></tr>):<tr><td colSpan={4}>Catálogo vazio.</td></tr>}
          </tbody></table>
        </div>
      </section>
    </div>}

    {tab==='propostas'&&<div className="settings-grid">
      <section className="card section">
        <h3>Nova proposta</h3>
        <form onSubmit={createProposal} style={{display:'grid',gap:9}}>
          <div className="form-grid">
            <div className="field"><label>Título</label><input className="input" name="title" required/></div>
            <div className="field"><label>Cliente</label><select className="select" name="contact_id"><option value="">Sem vínculo</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label>Produto/serviço</label><select className="select" name="product_id"><option value="">Item livre</option>{products.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="field"><label>Descrição livre</label><input className="input" name="item_description"/></div>
            <div className="field"><label>Quantidade</label><input className="input" name="quantity" type="number" step="0.001" defaultValue="1" min="0.001"/></div>
            <div className="field"><label>Preço unitário</label><input className="input" name="unit_price" type="number" step="0.01" min="0"/></div>
            <div className="field"><label>Desconto total</label><input className="input" name="discount" type="number" step="0.01" defaultValue="0" min="0"/></div>
            <div className="field"><label>Validade</label><input className="input" name="valid_until" type="date"/></div>
          </div>
          <div className="field"><label>Observações</label><textarea className="textarea" name="notes" rows={3}/></div>
          <button className="btn btn-primary"><FileText size={14}/>Criar proposta</button>
        </form>
      </section>
      <section className="card section">
        <div className="automation-top"><h3>Propostas</h3><strong>{money(proposalTotal)}</strong></div>
        <div className="table-wrap" style={{maxHeight:430}}>
          <table className="table"><thead><tr><th>Proposta</th><th>Cliente</th><th>Status</th><th>Total</th><th>Ações</th></tr></thead><tbody>
            {proposals.length?proposals.map(p=><tr key={p.id}>
              <td><strong>{p.title}</strong><small className="muted" style={{display:'block'}}>{p.proposal_number||'—'}</small></td>
              <td>{Array.isArray(p.contact)?p.contact[0]?.name:p.contact?.name||'—'}</td>
              <td>{p.status}</td>
              <td>{money(p.total)}</td>
              <td><div className="inlineActions">
                {p.status==='draft'&&<button type="button" className="btn btn-secondary" onClick={()=>void proposalAction(p,'submit_approval')}>Solicitar aprovação</button>}
                {['draft','pending_approval'].includes(p.status)&&<button type="button" className="btn btn-secondary" onClick={()=>void proposalAction(p,'approve')}>Aprovar</button>}
                {['draft','approved'].includes(p.status)&&<button type="button" className="btn btn-primary" onClick={()=>void proposalAction(p,'send')}>Preparar envio</button>}
                {['sent','accepted','rejected','expired'].includes(p.status)&&p.public_token&&<a className="btn btn-secondary" target="_blank" rel="noreferrer" href={`/proposal/${p.public_token}`}>Abrir</a>}
              </div></td>
            </tr>):<tr><td colSpan={5}>Nenhuma proposta criada.</td></tr>}
          </tbody></table>
        </div>
      </section>
    </div>}

    {tab==='sequencias'&&<div className="settings-grid">
      <section className="card section">
        <h3>Nova sequência</h3>
        <form onSubmit={createSequence} style={{display:'grid',gap:9}}>
          <div className="field"><label>Nome</label><input className="input" name="name" required/></div>
          <div className="field"><label>Descrição</label><input className="input" name="description"/></div>
          <div className="form-grid">
            <div className="field"><label>1º passo</label><select className="select" name="action1"><option value="task">Criar tarefa</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="internal_note">Nota interna</option></select></div>
            <div className="field"><label>Atraso em minutos</label><input className="input" name="delay1" type="number" min="0" defaultValue="0"/></div>
          </div>
          <div className="field"><label>Conteúdo do 1º passo</label><textarea className="textarea" name="body1" rows={2}/></div>
          <div className="form-grid">
            <div className="field"><label>2º passo</label><select className="select" name="action2"><option value="whatsapp">WhatsApp</option><option value="task">Criar tarefa</option><option value="email">E-mail</option><option value="internal_note">Nota interna</option></select></div>
            <div className="field"><label>Atraso em minutos</label><input className="input" name="delay2" type="number" min="0" defaultValue="1440"/></div>
          </div>
          <div className="field"><label>Conteúdo do 2º passo</label><textarea className="textarea" name="body2" rows={2}/></div>
          <button className="btn btn-primary"><Send size={14}/>Criar sequência</button>
        </form>
      </section>
      <section className="card section">
        <h3>Sequências cadastradas</h3>
        <div style={{display:'grid',gap:8}}>
          {sequences.length?sequences.map(s=><div className="setting-row" key={s.id}><span><strong>{s.name}</strong><small className="muted" style={{display:'block'}}>{s.description||'Sem descrição'} · {(s.sales_sequence_steps??[]).length} passo(s)</small></span><span className="badge">{s.active?'Ativa':'Pausada'}</span></div>):<p className="muted">Nenhuma sequência criada.</p>}
        </div>
      </section>
    </div>}

    {tab==='pesquisas'&&<div className="settings-grid">
      <section className="card section">
        <h3>Nova pesquisa</h3>
        <form onSubmit={createSurvey} style={{display:'grid',gap:9}}>
          <div className="form-grid">
            <div className="field"><label>Nome</label><input className="input" name="name" required/></div>
            <div className="field"><label>Tipo</label><select className="select" name="survey_type"><option value="nps">NPS</option><option value="csat">CSAT</option></select></div>
          </div>
          <div className="field"><label>Pergunta</label><input className="input" name="question" required placeholder="Qual a probabilidade de recomendar nossa empresa?"/></div>
          <button className="btn btn-primary"><Star size={14}/>Criar pesquisa</button>
        </form>
      </section>
      <section className="card section">
        <h3>Pesquisas</h3>
        <div style={{display:'grid',gap:8}}>
          {surveys.length?surveys.map(s=>{
            const responses=s.customer_survey_responses??[];
            const avg=responses.length?responses.reduce((sum,r)=>sum+Number(r.score),0)/responses.length:0;
            return <div className="setting-row" key={s.id}><span><strong>{s.name}</strong><small className="muted" style={{display:'block'}}>{s.survey_type.toUpperCase()} · {s.question}</small></span><span><strong>{responses.length?avg.toFixed(1):'—'}</strong><small className="muted" style={{display:'block'}}>{responses.length} resposta(s)</small></span></div>;
          }):<p className="muted">Nenhuma pesquisa criada.</p>}
        </div>
      </section>
    </div>}
  </div>;
}
