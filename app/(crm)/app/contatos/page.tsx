'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  BriefcaseBusiness, Building2, Download, Filter, GitMerge, Mail, MessageSquare,
  Phone, Plus, Search, Tag, Trash2, Upload, UserCheck, UsersRound, UserX, X
} from 'lucide-react';
import styles from '../commercial.module.css';

type ContactStatus='lead'|'active'|'inactive';
type TagItem={id:string;name:string;color?:string|null};
type Organization={id:string;name:string;document?:string|null;segment?:string|null};
type Contact={
  id:string;name:string;email?:string|null;phone?:string|null;source?:string|null;status:ContactStatus;
  lead_score?:number;lead_temperature?:'cold'|'warm'|'hot';organization_id?:string|null;
  organization?:Organization|null;contact_tags?:Array<{tag:TagItem}>;created_at?:string;
};
type DuplicateGroup={key:string;items:Array<{id:string;name:string;email?:string|null;phone?:string|null;created_at:string}>};
type CustomFieldDef={
  id:string;
  field_key:string;
  label:string;
  field_type:'text'|'textarea'|'number'|'date'|'boolean'|'select'|'email'|'phone'|'url';
  options?:string[];
  required:boolean;
  active:boolean;
  sort_order:number;
};

const statusLabel:Record<ContactStatus,string>={lead:'Lead',active:'Cliente ativo',inactive:'Inativo'};
const statusClass:Record<ContactStatus,string>={lead:styles.statusLead,active:styles.statusActive,inactive:styles.statusInactive};
const tempLabel={cold:'Frio',warm:'Morno',hot:'Quente'};

function initials(name:string){return name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'EC';}

export default function Contatos(){
  const [rows,setRows]=useState<Contact[]>([]);
  const [organizations,setOrganizations]=useState<Organization[]>([]);
  const [tags,setTags]=useState<TagItem[]>([]);
  const [duplicates,setDuplicates]=useState<DuplicateGroup[]>([]);
  const [customFields,setCustomFields]=useState<CustomFieldDef[]>([]);
  const [open,setOpen]=useState(false);
  const [openOrg,setOpenOrg]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [query,setQuery]=useState('');
  const [statusFilter,setStatusFilter]=useState<'all'|ContactStatus>('all');
  const importRef=useRef<HTMLInputElement>(null);

  async function load(){
    const [cr,or,tr,dr,cfr]=await Promise.all([
      fetch('/api/contacts',{cache:'no-store'}),
      fetch('/api/organizations',{cache:'no-store'}),
      fetch('/api/tags',{cache:'no-store'}),
      fetch('/api/contacts/duplicates',{cache:'no-store'}),
      fetch('/api/custom-fields?entity=contacts',{cache:'no-store'})
    ]);
    const [cd,od,td,dd,cfd]=await Promise.all([cr.json(),or.json(),tr.json(),dr.json(),cfr.json().catch(()=>null)]);
    if(cr.ok)setRows(cd.data??[]);else setError('Não foi possível carregar contatos.');
    if(or.ok)setOrganizations(od.data??[]);
    if(tr.ok)setTags(td.data??[]);
    if(dr.ok)setDuplicates(dd.data??[]);
    if(cfr.ok)setCustomFields((cfd?.data??[]).filter((field:CustomFieldDef)=>field.active));
  }

  useEffect(()=>{void load();},[]);

  const summary=useMemo(()=>({
    total:rows.length,
    leads:rows.filter(row=>row.status==='lead').length,
    active:rows.filter(row=>row.status==='active').length,
    hot:rows.filter(row=>row.status==='lead'&&row.lead_temperature==='hot').length
  }),[rows]);

  const sourceSummary=useMemo(()=>{
    const map=new Map<string,number>();
    for(const row of rows){const source=row.source?.trim()||'Sem origem';map.set(source,(map.get(source)??0)+1);}
    return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
  },[rows]);

  const filteredRows=useMemo(()=>{
    const term=query.trim().toLowerCase();
    return rows.filter(row=>{
      const org=Array.isArray(row.organization)?row.organization[0]:row.organization;
      const text=[row.name,row.email,row.phone,row.source,org?.name].filter(Boolean).join(' ').toLowerCase();
      return(!term||text.includes(term))&&(statusFilter==='all'||row.status===statusFilter);
    });
  },[query,rows,statusFilter]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setSaving(true);setError('');setNotice('');
    const form=new FormData(event.currentTarget);
    const tagId=String(form.get('tag_id')??'').trim();
    const custom_fields=Object.fromEntries(
      customFields.map(field=>{
        const raw=form.get('custom__'+field.field_key);
        if(field.field_type==='boolean') return [field.field_key,raw==='on'];
        if(field.field_type==='number') return [field.field_key,String(raw??'').trim()?Number(raw):null];
        return [field.field_key,String(raw??'').trim()||null];
      }).filter(([,value])=>value!==null&&value!=='')
    );
    const body={
      name:String(form.get('name')??''),
      email:String(form.get('email')??'').trim()||null,
      phone:String(form.get('phone')??'').trim()||null,
      source:String(form.get('source')??'').trim()||null,
      organization_id:String(form.get('organization_id')??'').trim()||null,
      status:form.get('status'),
      custom_fields
    };
    const response=await fetch('/api/contacts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const payload=await response.json().catch(()=>null);
    setSaving(false);
    if(response.ok){
      if(tagId&&payload?.data?.id)await fetch(`/api/contacts/${payload.data.id}/tags`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tag_id:tagId})});
      setOpen(false);setNotice('Contato criado e distribuído conforme as regras da equipe.');await load();
    }else setError('Não foi possível salvar o contato.');
  }

  async function createOrganization(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');setNotice('');
    const form=new FormData(event.currentTarget);
    const response=await fetch('/api/organizations',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        name:String(form.get('name')??'').trim(),
        legal_name:String(form.get('legal_name')??'').trim()||null,
        document:String(form.get('document')??'').trim()||null,
        website:String(form.get('website')??'').trim()||null,
        phone:String(form.get('phone')??'').trim()||null,
        email:String(form.get('email')??'').trim()||null,
        segment:String(form.get('segment')??'').trim()||null,
        size:String(form.get('size')??'').trim()||null,
        custom_fields:{}
      })
    });
    if(response.ok){
      event.currentTarget.reset();
      setOpenOrg(false);
      setNotice('Empresa cadastrada e disponível para vincular aos contatos.');
      await load();
    }else setError('Não foi possível cadastrar a empresa.');
  }

  async function status(id:string,value:ContactStatus){
    setError('');const response=await fetch(`/api/contacts/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:value})});
    if(!response.ok)setError('Sem permissão para alterar este contato.');await load();
  }

  async function remove(id:string){
    if(!confirm('Excluir este contato?'))return;
    const response=await fetch(`/api/contacts/${id}`,{method:'DELETE'});
    if(!response.ok)setError('Não foi possível excluir. O contato pode possuir vínculos ou seu perfil não possui permissão.');
    await load();
  }

  async function start(id:string){
    setError('');
    const response=await fetch('/api/conversations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contact_id:id,channel:'internal'})});
    if(response.ok)window.location.href='/app/atendimento';else setError('Não foi possível iniciar o atendimento.');
  }

  async function createDeal(contact:Contact){
    setError('');
    const response=await fetch('/api/deals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:`Oportunidade - ${contact.name}`,contact_id:contact.id,stage:'new',value:0,probability:contact.status==='lead'?10:25})});
    if(response.ok)window.location.href='/app/pipeline';else setError('Não foi possível criar a oportunidade.');
  }

  async function addTag(contactId:string,tagId:string){
    if(!tagId)return;
    const response=await fetch(`/api/contacts/${contactId}/tags`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tag_id:tagId})});
    if(response.ok)await load();else setError('Não foi possível adicionar a tag.');
  }

  async function importContacts(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];if(!file)return;
    setNotice('');setError('');
    const form=new FormData();form.append('file',file);
    const r=await fetch('/api/contacts/import',{method:'POST',body:form});
    const d=await r.json().catch(()=>null);
    e.target.value='';
    if(r.ok){setNotice(`Importação concluída: ${d?.data?.processed??0} processados, ${d?.data?.failed??0} com erro.`);await load();}
    else setError('Não foi possível importar a planilha.');
  }

  async function merge(group:DuplicateGroup){
    if(group.items.length<2)return;
    const target=group.items[0];const source=group.items[group.items.length-1];
    if(!confirm(`Mesclar "${source.name}" em "${target.name}" preservando histórico?`))return;
    const r=await fetch('/api/contacts/duplicates',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source_id:source.id,target_id:target.id})});
    if(r.ok){setNotice('Contatos mesclados com histórico preservado.');await load();}else setError('Não foi possível mesclar os contatos.');
  }

  return <div className={`content ${styles.page}`}>
    <div className={styles.hero}>
      <div><h1 className="page-title">Contatos</h1><p className="page-sub">Clientes, leads, empresas e histórico comercial em uma única base.</p></div>
      <div className={styles.heroActions}>
        <input ref={importRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={importContacts}/>
        <button type="button" className="btn btn-secondary" onClick={()=>importRef.current?.click()}><Upload size={15}/>Importar</button>
        <button type="button" className="btn btn-secondary" onClick={()=>{window.location.href='/api/contacts/export';}}><Download size={15}/>Exportar</button>
        <button type="button" className="btn btn-secondary" onClick={()=>setOpenOrg(value=>!value)}><Building2 size={15}/>{openOrg?'Fechar empresa':'Nova empresa'}</button>
        <button type="button" className="btn btn-primary" onClick={()=>setOpen(value=>!value)}>{open?<X size={17}/>:<Plus size={17}/>} {open?'Fechar':'Novo contato'}</button>
      </div>
    </div>

    <section className={styles.kpiGrid}>
      <article className={styles.kpi}><span className={styles.kpiIcon}><UsersRound size={18}/></span><span>Total</span><strong>{summary.total}</strong><small>contatos cadastrados</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconBlue}`}><BriefcaseBusiness size={18}/></span><span>Leads</span><strong>{summary.leads}</strong><small>em qualificação</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconAmber}`}><UserCheck size={18}/></span><span>Ativos</span><strong>{summary.active}</strong><small>clientes ativos</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconRose}`}><UserX size={18}/></span><span>Leads quentes</span><strong>{summary.hot}</strong><small>prioridade alta</small></article>
    </section>

    <section className={styles.toolbar}>
      <label className={styles.searchField}><Search size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar nome, e-mail, telefone, origem ou empresa"/></label>
      <label className={styles.selectField}><Filter size={16}/><select value={statusFilter} onChange={event=>setStatusFilter(event.target.value as 'all'|ContactStatus)}><option value="all">Todos os status</option><option value="lead">Leads</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
      <label className={styles.selectField}><GitMerge size={16}/><span>{duplicates.length} grupo(s) duplicado(s)</span></label>
    </section>

    {error&&<div className="error">{error}</div>}
    {notice&&<div className="success">{notice}</div>}

    {openOrg&&<form className={styles.formPanel} onSubmit={createOrganization}>
      <div><h3>Nova empresa</h3><p className={styles.sideHint}>Cadastre a organização uma vez e vincule vários contatos ao mesmo CNPJ.</p></div>
      <div className={styles.formGrid}>
        <div className="field"><label>Nome fantasia</label><input className="input" name="name" required/></div>
        <div className="field"><label>Razão social</label><input className="input" name="legal_name"/></div>
        <div className="field"><label>CNPJ / documento</label><input className="input" name="document"/></div>
        <div className="field"><label>Segmento</label><input className="input" name="segment"/></div>
        <div className="field"><label>Porte</label><input className="input" name="size"/></div>
        <div className="field"><label>Site</label><input className="input" type="url" name="website"/></div>
        <div className="field"><label>Telefone</label><input className="input" name="phone"/></div>
        <div className="field"><label>E-mail</label><input className="input" type="email" name="email"/></div>
      </div>
      <div className={styles.formFooter}><button className="btn btn-primary"><Building2 size={14}/>Salvar empresa</button></div>
    </form>}

    {open&&<form className={styles.formPanel} onSubmit={submit}>
      <div><h3>Novo contato</h3></div>
      <div className={styles.formGrid}>
        <div className="field"><label>Nome</label><input className="input" name="name" required/></div>
        <div className="field"><label>E-mail</label><input className="input" type="email" name="email"/></div>
        <div className="field"><label>Telefone</label><input className="input" name="phone"/></div>
        <div className="field"><label>Origem</label><input className="input" name="source" placeholder="Site, Instagram, indicação..."/></div>
        <div className="field"><label>Empresa</label><select className="select" name="organization_id" defaultValue=""><option value="">Sem empresa</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        <div className="field"><label>Tag inicial</label><select className="select" name="tag_id" defaultValue=""><option value="">Sem tag</option>{tags.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div className="field"><label>Status</label><select className="select" name="status" defaultValue="lead"><option value="lead">Lead</option><option value="active">Cliente ativo</option><option value="inactive">Inativo</option></select></div>
        {customFields.map(field=><div className="field" key={field.id}>
          <label>{field.label}{field.required?' *':''}</label>
          {field.field_type==='textarea'?<textarea className="textarea" name={'custom__'+field.field_key} rows={3} required={field.required}/>:
           field.field_type==='select'?<select className="select" name={'custom__'+field.field_key} required={field.required} defaultValue=""><option value="">Selecione</option>{(field.options??[]).map(option=><option key={option} value={option}>{option}</option>)}</select>:
           field.field_type==='boolean'?<input type="checkbox" name={'custom__'+field.field_key}/>:
           <input className="input" name={'custom__'+field.field_key} required={field.required}
             type={field.field_type==='number'?'number':field.field_type==='date'?'date':field.field_type==='email'?'email':field.field_type==='url'?'url':'text'}/>}
        </div>)}
      </div>
      <div className={styles.formFooter}><button className="btn btn-primary" disabled={saving}>{saving?'Salvando...':'Salvar contato'}</button></div>
    </form>}

    {duplicates.length>0&&<section className="card section">
      <h3>Possíveis duplicidades</h3>
      <div style={{display:'grid',gap:8}}>
        {duplicates.slice(0,6).map(group=><div className="setting-row" key={group.key}>
          <span><strong>{group.items.map(i=>i.name).join(' / ')}</strong><small className="muted" style={{display:'block'}}>{group.key.replace('phone:','Telefone: ').replace('email:','E-mail: ')}</small></span>
          <button className="btn btn-secondary" onClick={()=>void merge(group)}><GitMerge size={14}/>Mesclar</button>
        </div>)}
      </div>
    </section>}

    <div className={styles.workspace}>
      <section className={styles.cardGrid}>
        {filteredRows.length?filteredRows.map(row=>{
          const org=Array.isArray(row.organization)?row.organization[0]:row.organization;
          return <article className={styles.recordCard} key={row.id}>
            <div className={styles.recordTop}>
              <div className={styles.identity}><span className={styles.avatar}>{initials(row.name)}</span><div className={styles.identityCopy}><strong>{row.name}</strong><span>{row.source||'Origem não informada'}</span>{org?.name&&<span><Building2 size={11}/> {org.name}</span>}</div></div>
              <span className={`${styles.statusBadge} ${statusClass[row.status]}`}>{statusLabel[row.status]}</span>
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {row.status==='lead'&&<span className={styles.priorityBadge}>{tempLabel[row.lead_temperature??'cold']} · score {row.lead_score??0}</span>}
              {(row.contact_tags??[]).map(item=>item.tag&&<span className={styles.statusBadge} key={item.tag.id}><Tag size={10}/>{item.tag.name}</span>)}
            </div>
            <div className={styles.metaList}><div className={styles.metaLine}><Mail size={15}/><span>{row.email||'E-mail não informado'}</span></div><div className={styles.metaLine}><Phone size={15}/><span>{row.phone||'Telefone não informado'}</span></div></div>
            <div className={styles.cardActions}>
              <select className="select compact-select" value={row.status} onChange={event=>void status(row.id,event.target.value as ContactStatus)}><option value="lead">Lead</option><option value="active">Ativo</option><option value="inactive">Inativo</option></select>
              {tags.length>0&&<select className="select compact-select" defaultValue="" onChange={e=>{void addTag(row.id,e.target.value);e.target.value='';}}><option value="">+ Tag</option>{tags.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>}
              <button type="button" className="btn btn-secondary icon-btn" onClick={()=>void start(row.id)} title="Iniciar atendimento"><MessageSquare size={15}/></button>
              <button type="button" className="btn btn-secondary icon-btn" onClick={()=>void createDeal(row)} title="Criar oportunidade"><BriefcaseBusiness size={15}/></button>
              <button type="button" className="btn btn-danger icon-btn" onClick={()=>void remove(row.id)} title="Excluir"><Trash2 size={15}/></button>
            </div>
          </article>;
        }):<div className={styles.emptyState}>Nenhum contato encontrado.</div>}
      </section>

      <aside className={styles.sidePanel}><h3>Origem dos contatos</h3><div className={styles.sourceList}>{sourceSummary.length?sourceSummary.map(([source,count])=><div className={styles.sourceItem} key={source}><div className={styles.sourceItemTop}><strong>{source}</strong><span>{count}</span></div><div className={styles.progressTrack}><i style={{width:`${Math.max(8,(count/Math.max(1,summary.total))*100)}%`}}/></div></div>):<div className={styles.emptyState}>Sem origem registrada.</div>}</div></aside>
    </div>
  </div>;
}
