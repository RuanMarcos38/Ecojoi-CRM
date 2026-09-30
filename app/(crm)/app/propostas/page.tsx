'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Boxes, FileText, Plus, ReceiptText, Search, X } from 'lucide-react';

type Product={id:string;sku?:string|null;name:string;description?:string|null;unit:string;price:number;cost?:number|null;active:boolean};
type Proposal={id:string;proposal_number?:string|null;title:string;status:string;currency:string;subtotal:number;discount_percent:number;total:number;valid_until?:string|null;created_at:string;contact?:{id:string;name:string}|null;deal?:{id:string;title:string}|null};
type Contact={id:string;name:string};
type Deal={id:string;title:string};

function money(v:number){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

export default function Propostas(){
  const [products,setProducts]=useState<Product[]>([]);
  const [proposals,setProposals]=useState<Proposal[]>([]);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [deals,setDeals]=useState<Deal[]>([]);
  const [openProduct,setOpenProduct]=useState(false);
  const [openProposal,setOpenProposal]=useState(false);
  const [query,setQuery]=useState('');
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');

  async function load(){
    const [pr,qr,cr,dr]=await Promise.all([
      fetch('/api/catalog/products',{cache:'no-store'}),
      fetch('/api/proposals',{cache:'no-store'}),
      fetch('/api/contacts',{cache:'no-store'}),
      fetch('/api/deals',{cache:'no-store'})
    ]);
    const [pd,qd,cd,dd]=await Promise.all([pr.json(),qr.json(),cr.json(),dr.json()]);
    if(pr.ok)setProducts(pd.data??[]);
    if(qr.ok)setProposals(qd.data??[]);
    if(cr.ok)setContacts(cd.data??[]);
    if(dr.ok)setDeals(dd.data??[]);
  }

  useEffect(()=>{void load();},[]);

  const filtered=useMemo(()=>proposals.filter(p=>!query.trim()||[p.title,p.proposal_number,p.contact?.name,p.deal?.title].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase())),[proposals,query]);

  async function createProduct(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const fd=new FormData(e.currentTarget);
    const r=await fetch('/api/catalog/products',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      sku:String(fd.get('sku')||'').trim()||null,name:fd.get('name'),description:String(fd.get('description')||'').trim()||null,unit:fd.get('unit')||'un',
      price:Number(fd.get('price')||0),cost:String(fd.get('cost')||'').trim()?Number(fd.get('cost')):null,active:true
    })});
    if(r.ok){setOpenProduct(false);e.currentTarget.reset();setNotice('Produto adicionado ao catálogo.');await load();}else setError('Não foi possível salvar o produto.');
  }

  async function createProposal(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const fd=new FormData(e.currentTarget);
    const product=products.find(p=>p.id===String(fd.get('product_id')));
    if(!product){setError('Selecione um produto.');return;}
    const quantity=Math.max(1,Number(fd.get('quantity')||1));
    const r=await fetch('/api/proposals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      deal_id:String(fd.get('deal_id')||'')||null,contact_id:String(fd.get('contact_id')||'')||null,title:fd.get('title'),valid_until:String(fd.get('valid_until')||'')||null,
      discount_percent:Number(fd.get('discount_percent')||0),notes:String(fd.get('notes')||'')||null,terms:String(fd.get('terms')||'')||null,
      items:[{product_id:product.id,description:product.name,quantity,unit_price:Number(product.price),discount_percent:0}]
    })});
    if(r.ok){setOpenProposal(false);e.currentTarget.reset();setNotice('Proposta criada.');await load();}else setError('Não foi possível criar a proposta.');
  }

  return <div className="content">
    <div className="page-head">
      <div><h1 className="page-title">Propostas e Catálogo</h1><p className="page-sub">Produtos, preços e propostas comerciais centralizados no CRM.</p></div>
      <div className="page-actions">
        <button className="btn btn-secondary" onClick={()=>setOpenProduct(v=>!v)}><Boxes size={16}/>{openProduct?'Fechar':'Novo produto'}</button>
        <button className="btn btn-primary" onClick={()=>setOpenProposal(v=>!v)}><Plus size={16}/>{openProposal?'Fechar':'Nova proposta'}</button>
      </div>
    </div>

    {error&&<div className="error">{error}</div>}
    {notice&&<div className="success">{notice}</div>}

    {openProduct&&<form className="card section" onSubmit={createProduct}>
      <h3>Produto ou serviço</h3>
      <div className="form-grid">
        <div className="field"><label>Nome</label><input className="input" name="name" required/></div>
        <div className="field"><label>SKU</label><input className="input" name="sku"/></div>
        <div className="field"><label>Preço</label><input className="input" name="price" type="number" min="0" step="0.01" required/></div>
        <div className="field"><label>Custo</label><input className="input" name="cost" type="number" min="0" step="0.01"/></div>
        <div className="field"><label>Unidade</label><input className="input" name="unit" defaultValue="un"/></div>
        <div className="field"><label>Descrição</label><input className="input" name="description"/></div>
      </div>
      <button className="btn btn-primary" style={{marginTop:12}}>Salvar produto</button>
    </form>}

    {openProposal&&<form className="card section" onSubmit={createProposal}>
      <h3>Nova proposta</h3>
      <div className="form-grid">
        <div className="field"><label>Título</label><input className="input" name="title" required/></div>
        <div className="field"><label>Contato</label><select className="select" name="contact_id" defaultValue=""><option value="">Sem contato</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Oportunidade</label><select className="select" name="deal_id" defaultValue=""><option value="">Sem oportunidade</option>{deals.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></div>
        <div className="field"><label>Produto</label><select className="select" name="product_id" required defaultValue=""><option value="" disabled>Selecione</option>{products.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.price)}</option>)}</select></div>
        <div className="field"><label>Quantidade</label><input className="input" name="quantity" type="number" min="1" step="1" defaultValue="1"/></div>
        <div className="field"><label>Desconto geral (%)</label><input className="input" name="discount_percent" type="number" min="0" max="100" step="0.01" defaultValue="0"/></div>
        <div className="field"><label>Validade</label><input className="input" name="valid_until" type="date"/></div>
        <div className="field"><label>Observações</label><input className="input" name="notes"/></div>
      </div>
      <div className="field" style={{marginTop:10}}><label>Condições</label><textarea className="textarea" name="terms" rows={3}/></div>
      <button className="btn btn-primary" style={{marginTop:12}}>Criar proposta</button>
    </form>}

    <section className="grid stats" style={{marginTop:12}}>
      <article className="card stat"><span className="stat-label">Produtos ativos</span><div className="stat-value">{products.filter(p=>p.active).length}</div></article>
      <article className="card stat"><span className="stat-label">Propostas</span><div className="stat-value">{proposals.length}</div></article>
      <article className="card stat"><span className="stat-label">Aceitas</span><div className="stat-value">{proposals.filter(p=>p.status==='accepted').length}</div></article>
      <article className="card stat"><span className="stat-label">Valor em propostas</span><div className="stat-value" style={{fontSize:21}}>{money(proposals.filter(p=>!['rejected','expired'].includes(p.status)).reduce((s,p)=>s+Number(p.total||0),0))}</div></article>
    </section>

    <section className="card section">
      <div className="page-head" style={{marginBottom:10}}>
        <div><h3 style={{margin:0}}>Propostas</h3></div>
        <label className="search" style={{minWidth:280}}><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar proposta..."/></label>
      </div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Número</th><th>Proposta</th><th>Contato</th><th>Status</th><th>Total</th><th>Validade</th></tr></thead><tbody>
        {filtered.length?filtered.map(p=><tr key={p.id}><td>{p.proposal_number||'—'}</td><td><strong>{p.title}</strong></td><td>{p.contact?.name||'—'}</td><td><span className="badge">{p.status}</span></td><td>{money(p.total)}</td><td>{p.valid_until?new Date(p.valid_until+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</td></tr>):<tr><td colSpan={6}>Nenhuma proposta cadastrada.</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
