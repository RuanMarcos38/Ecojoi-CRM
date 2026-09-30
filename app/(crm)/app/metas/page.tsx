'use client';

import { FormEvent,useEffect,useMemo,useState } from 'react';
import { Plus,Target,Users } from 'lucide-react';

type Goal={id:string;user_id?:string|null;period_start:string;period_end:string;revenue_target:number;deals_target:number;leads_target:number;user?:{id:string;full_name:string}|null};
type Member={id:string;full_name:string;active:boolean};

function money(v:number){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

export default function Metas(){
  const [goals,setGoals]=useState<Goal[]>([]);
  const [members,setMembers]=useState<Member[]>([]);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');

  async function load(){
    const [gr,mr]=await Promise.all([fetch('/api/goals',{cache:'no-store'}),fetch('/api/team',{cache:'no-store'})]);
    const [gd,md]=await Promise.all([gr.json(),mr.json()]);
    if(gr.ok)setGoals(gd.data??[]);
    if(mr.ok)setMembers((md.data??[]).filter((m:Member)=>m.active));
  }
  useEffect(()=>{void load();},[]);

  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const fd=new FormData(e.currentTarget);
    const r=await fetch('/api/goals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      user_id:String(fd.get('user_id')||'')||null,period_start:fd.get('period_start'),period_end:fd.get('period_end'),
      revenue_target:Number(fd.get('revenue_target')||0),deals_target:Number(fd.get('deals_target')||0),leads_target:Number(fd.get('leads_target')||0)
    })});
    if(r.ok){setNotice('Meta comercial criada.');e.currentTarget.reset();await load();}else setError('Não foi possível criar a meta.');
  }

  const summary=useMemo(()=>goals.reduce((a,g)=>({revenue:a.revenue+Number(g.revenue_target||0),deals:a.deals+Number(g.deals_target||0),leads:a.leads+Number(g.leads_target||0)}),{revenue:0,deals:0,leads:0}),[goals]);

  return <div className="content">
    <div className="page-head"><div><h1 className="page-title">Metas comerciais</h1><p className="page-sub">Objetivos por vendedor, equipe e período.</p></div></div>
    {error&&<div className="error">{error}</div>}{notice&&<div className="success">{notice}</div>}
    <section className="grid stats">
      <article className="card stat"><Target size={18}/><div className="stat-value" style={{fontSize:21}}>{money(summary.revenue)}</div><div className="stat-label">Receita-meta cadastrada</div></article>
      <article className="card stat"><Users size={18}/><div className="stat-value">{summary.deals}</div><div className="stat-label">Negócios-meta</div></article>
      <article className="card stat"><Plus size={18}/><div className="stat-value">{summary.leads}</div><div className="stat-label">Leads-meta</div></article>
      <article className="card stat"><div className="stat-value">{goals.length}</div><div className="stat-label">Metas ativas/históricas</div></article>
    </section>
    <form className="card section" onSubmit={create}>
      <h3>Nova meta</h3>
      <div className="form-grid">
        <div className="field"><label>Responsável</label><select className="select" name="user_id" defaultValue=""><option value="">Equipe inteira</option>{members.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select></div>
        <div className="field"><label>Início</label><input className="input" type="date" name="period_start" required/></div>
        <div className="field"><label>Fim</label><input className="input" type="date" name="period_end" required/></div>
        <div className="field"><label>Meta de receita</label><input className="input" type="number" name="revenue_target" min="0" step="0.01" defaultValue="0"/></div>
        <div className="field"><label>Meta de negócios</label><input className="input" type="number" name="deals_target" min="0" defaultValue="0"/></div>
        <div className="field"><label>Meta de leads</label><input className="input" type="number" name="leads_target" min="0" defaultValue="0"/></div>
      </div>
      <button className="btn btn-primary" style={{marginTop:12}}><Plus size={14}/>Salvar meta</button>
    </form>
    <section className="card section">
      <h3>Metas cadastradas</h3>
      <div className="table-wrap"><table className="table"><thead><tr><th>Responsável</th><th>Período</th><th>Receita</th><th>Negócios</th><th>Leads</th></tr></thead><tbody>
        {goals.length?goals.map(g=><tr key={g.id}><td>{g.user?.full_name||'Equipe'}</td><td>{new Date(g.period_start+'T12:00:00').toLocaleDateString('pt-BR')} – {new Date(g.period_end+'T12:00:00').toLocaleDateString('pt-BR')}</td><td>{money(g.revenue_target)}</td><td>{g.deals_target}</td><td>{g.leads_target}</td></tr>):<tr><td colSpan={5}>Nenhuma meta cadastrada.</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
