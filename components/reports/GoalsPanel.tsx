'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Target } from 'lucide-react';

type Member={id:string;full_name:string;active:boolean};
type Goal={id:string;user_id?:string|null;period_start:string;period_end:string;revenue_target:number;deals_target:number;leads_target:number;user?:{id:string;full_name:string}|null};

function money(value:number){return Number(value??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

export function GoalsPanel(){
  const [members,setMembers]=useState<Member[]>([]);
  const [goals,setGoals]=useState<Goal[]>([]);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  async function load(){
    const [gr,tr]=await Promise.all([fetch('/api/goals',{cache:'no-store'}),fetch('/api/team',{cache:'no-store'})]);
    const [gd,td]=await Promise.all([gr.json().catch(()=>null),tr.json().catch(()=>null)]);
    if(gr.ok)setGoals(gd?.data??[]);
    if(tr.ok)setMembers((td?.data??[]).filter((m:Member)=>m.active));
  }
  useEffect(()=>{void load();},[]);

  const current=useMemo(()=>goals.slice(0,8),[goals]);

  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const formElement=e.currentTarget;const fd=new FormData(formElement);
    const r=await fetch('/api/goals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      user_id:String(fd.get('user_id')??'')||null,
      period_start:String(fd.get('period_start')??''),
      period_end:String(fd.get('period_end')??''),
      revenue_target:Number(fd.get('revenue_target')??0),
      deals_target:Number(fd.get('deals_target')??0),
      leads_target:Number(fd.get('leads_target')??0)
    })});
    if(r.ok){setNotice('Meta criada.');formElement.reset();await load();}else setError('Não foi possível criar a meta.');
  }

  const today=new Date();
  const monthStart=new Date(today.getFullYear(),today.getMonth(),1).toISOString().slice(0,10);
  const monthEnd=new Date(today.getFullYear(),today.getMonth()+1,0).toISOString().slice(0,10);

  return <section className="card section">
    <div className="automation-top"><div><h3 style={{marginBottom:4}}>Metas comerciais</h3><p className="muted" style={{margin:0}}>Defina metas por vendedor ou para toda a equipe.</p></div><Target size={20}/></div>
    {error&&<div className="error">{error}</div>}{notice&&<div className="success">{notice}</div>}
    <form onSubmit={create} className="form-grid" style={{marginTop:12}}>
      <div className="field"><label>Responsável</label><select className="select" name="user_id" defaultValue=""><option value="">Equipe</option>{members.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select></div>
      <div className="field"><label>Início</label><input className="input" name="period_start" type="date" defaultValue={monthStart} required/></div>
      <div className="field"><label>Fim</label><input className="input" name="period_end" type="date" defaultValue={monthEnd} required/></div>
      <div className="field"><label>Meta de receita</label><input className="input" name="revenue_target" type="number" min="0" step="0.01" defaultValue="0"/></div>
      <div className="field"><label>Negócios</label><input className="input" name="deals_target" type="number" min="0" defaultValue="0"/></div>
      <div className="field"><label>Leads</label><input className="input" name="leads_target" type="number" min="0" defaultValue="0"/></div>
      <div className="field" style={{justifyContent:'end'}}><label>&nbsp;</label><button className="btn btn-primary">Salvar meta</button></div>
    </form>
    <div className="table-wrap" style={{marginTop:12,maxHeight:260}}>
      <table className="table"><thead><tr><th>Responsável</th><th>Período</th><th>Receita</th><th>Negócios</th><th>Leads</th></tr></thead><tbody>
        {current.length?current.map(g=><tr key={g.id}><td>{Array.isArray(g.user)?g.user[0]?.full_name:g.user?.full_name||'Equipe'}</td><td>{new Date(g.period_start+'T00:00:00').toLocaleDateString('pt-BR')} – {new Date(g.period_end+'T00:00:00').toLocaleDateString('pt-BR')}</td><td>{money(g.revenue_target)}</td><td>{g.deals_target}</td><td>{g.leads_target}</td></tr>):<tr><td colSpan={5}>Nenhuma meta cadastrada.</td></tr>}
      </tbody></table>
    </div>
  </section>;
}
