'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Plus, SlidersHorizontal, Trash2 } from 'lucide-react';

type FieldDef={
  id:string;
  entity_type:'contacts'|'leads'|'deals'|'tasks';
  field_key:string;
  label:string;
  field_type:'text'|'textarea'|'number'|'date'|'boolean'|'select'|'email'|'phone'|'url';
  options?:string[];
  required:boolean;
  active:boolean;
  sort_order:number;
};

const entityLabels={contacts:'Contatos',leads:'Leads',deals:'Negócios',tasks:'Tarefas'};
const typeLabels={text:'Texto',textarea:'Texto longo',number:'Número',date:'Data',boolean:'Sim/Não',select:'Lista',email:'E-mail',phone:'Telefone',url:'URL'};

export function CustomFieldsPanel({enabled}:{enabled:boolean}){
  const [rows,setRows]=useState<FieldDef[]>([]);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  async function load(){
    if(!enabled)return;
    const r=await fetch('/api/custom-fields',{cache:'no-store'});
    const d=await r.json().catch(()=>null);
    if(r.ok)setRows(d?.data??[]);
  }
  useEffect(()=>{void load();},[enabled]);

  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');
    const fd=new FormData(e.currentTarget);
    const fieldType=String(fd.get('field_type')??'text');
    const options=String(fd.get('options')??'').split(',').map(v=>v.trim()).filter(Boolean);
    const r=await fetch('/api/custom-fields',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        entity_type:String(fd.get('entity_type')??'contacts'),
        field_key:String(fd.get('field_key')??'').trim().toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,''),
        label:String(fd.get('label')??'').trim(),
        field_type:fieldType,
        options:fieldType==='select'?options:[],
        required:fd.get('required')==='on',
        active:true,
        sort_order:Number(fd.get('sort_order')??0)
      })
    });
    if(r.ok){
      e.currentTarget.reset();
      setNotice('Campo personalizado salvo.');
      await load();
    }else{
      const d=await r.json().catch(()=>null);
      setError(d?.error==='invalid_payload'?'Confira chave, nome e tipo do campo.':'Não foi possível salvar o campo.');
    }
  }

  async function disable(id:string){
    if(!confirm('Desativar este campo? Os valores já gravados nos registros serão preservados.'))return;
    const r=await fetch('/api/custom-fields/'+id,{method:'DELETE'});
    if(r.ok){setNotice('Campo desativado sem apagar dados existentes.');await load();}
    else setError('Não foi possível desativar o campo.');
  }

  if(!enabled)return null;

  return <section className="card section">
    <div className="automation-top">
      <div><h3 style={{marginBottom:4}}>Campos personalizados</h3><p className="muted" style={{margin:0}}>Crie campos sem alterar o banco manualmente a cada necessidade comercial.</p></div>
      <SlidersHorizontal size={21}/>
    </div>

    {error&&<div className="error" style={{marginTop:10}}>{error}</div>}
    {notice&&<div className="success" style={{marginTop:10}}>{notice}</div>}

    <form onSubmit={create} className="form-grid" style={{marginTop:12}}>
      <div className="field"><label>Entidade</label><select className="select" name="entity_type" defaultValue="contacts">{Object.entries(entityLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
      <div className="field"><label>Nome do campo</label><input className="input" name="label" placeholder="Ex.: CNPJ do comprador" required/></div>
      <div className="field"><label>Chave técnica</label><input className="input" name="field_key" placeholder="cnpj_comprador" required/></div>
      <div className="field"><label>Tipo</label><select className="select" name="field_type" defaultValue="text">{Object.entries(typeLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
      <div className="field"><label>Opções (se for Lista)</label><input className="input" name="options" placeholder="Opção A, Opção B, Opção C"/></div>
      <div className="field"><label>Ordem</label><input className="input" name="sort_order" type="number" min="0" defaultValue="0"/></div>
      <label className="setting-row" style={{border:0,padding:0}}><span>Obrigatório</span><input name="required" type="checkbox"/></label>
      <div className="field" style={{justifyContent:'end'}}><label>&nbsp;</label><button className="btn btn-primary"><Plus size={14}/>Adicionar campo</button></div>
    </form>

    <div className="table-wrap" style={{marginTop:12,maxHeight:300}}>
      <table className="table">
        <thead><tr><th>Campo</th><th>Entidade</th><th>Tipo</th><th>Obrigatório</th><th></th></tr></thead>
        <tbody>
          {rows.filter(r=>r.active).length?rows.filter(r=>r.active).map(row=><tr key={row.id}>
            <td><strong>{row.label}</strong><small className="muted" style={{display:'block'}}>{row.field_key}</small></td>
            <td>{entityLabels[row.entity_type]}</td>
            <td>{typeLabels[row.field_type]}</td>
            <td>{row.required?'Sim':'Não'}</td>
            <td><button className="btn btn-danger icon-btn" type="button" onClick={()=>void disable(row.id)} title="Desativar"><Trash2 size={14}/></button></td>
          </tr>):<tr><td colSpan={5}>Nenhum campo personalizado ativo.</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}
