'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  Filter,
  Mail,
  Phone,
  Plus,
  Search,
  CalendarDays,
  Target,
  UserPlus,
  X
} from 'lucide-react';
import styles from '../commercial.module.css';

type Attribution = {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  landing_page?: string | null;
  referrer?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
};

type SavedView={id:string;name:string;filters?:Record<string,unknown>;is_default?:boolean};

type Lead = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  owner_id?: string | null;
  owner?: { id: string; full_name: string } | null;
  attribution?: Attribution | null;
  lead_score?: number;
  lead_temperature?: 'cold' | 'warm' | 'hot';
  status: 'lead' | 'active' | 'inactive';
  created_at: string;
};

function ageLabel(value: string) {
  const created = new Date(value).getTime();
  if (!Number.isFinite(created)) return 'sem data';
  const days = Math.max(0, Math.floor((Date.now() - created) / 86400000));
  if (days === 0) return 'hoje';
  if (days === 1) return 'há 1 dia';
  return `há ${days} dias`;
}

function attributionLabel(lead: Lead) {
  const attribution = lead.attribution;
  if (!attribution) return '';
  const parts = [
    attribution.utm_campaign ? `Campanha: ${attribution.utm_campaign}` : '',
    attribution.utm_medium ? `Mídia: ${attribution.utm_medium}` : '',
    attribution.gclid ? 'Google Ads identificado' : '',
    attribution.fbclid ? 'Meta Ads identificado' : ''
  ].filter(Boolean);
  return parts.join(' · ');
}

export default function Leads() {
  const [rows, setRows] = useState<Lead[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [temperatureFilter,setTemperatureFilter]=useState<'all'|'cold'|'warm'|'hot'>('all');
  const [savedViews,setSavedViews]=useState<SavedView[]>([]);
  const [showSaveView,setShowSaveView]=useState(false);
  const [viewName,setViewName]=useState('');

  async function load() {
    const [response,viewsResponse]=await Promise.all([
      fetch('/api/contacts?status=lead', { cache: 'no-store' }),
      fetch('/api/saved-views?entity=leads',{cache:'no-store'})
    ]);
    const [payload,viewsPayload]=await Promise.all([
      response.json(),
      viewsResponse.ok?viewsResponse.json():Promise.resolve(null)
    ]);
    if (response.ok) setRows(payload.data ?? []);
    else setError('Não foi possível carregar leads.');
    if(viewsResponse.ok)setSavedViews(viewsPayload?.data??[]);
  }

  useEffect(() => { void load(); }, []);

  const sources = useMemo(() => {
    return [...new Set(rows.map(row => row.source?.trim() || 'Sem origem'))].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const sourceSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const source = row.source?.trim() || 'Sem origem';
      map.set(source, (map.get(source) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter(row => {
      const source = row.source?.trim() || 'Sem origem';
      const text = [row.name, row.email, row.phone, row.source].filter(Boolean).join(' ').toLowerCase();
      return (!term || text.includes(term))
        && (sourceFilter === 'all' || source === sourceFilter)
        && (temperatureFilter === 'all' || row.lead_temperature === temperatureFilter);
    });
  }, [query, rows, sourceFilter, temperatureFilter]);

  const recentCount = useMemo(() => rows.filter(row => Date.now() - new Date(row.created_at).getTime() <= 7 * 86400000).length, [rows]);
  const noPhoneCount = useMemo(() => rows.filter(row => !row.phone).length, [rows]);
  const hotCount = useMemo(() => rows.filter(row => row.lead_temperature === 'hot').length, [rows]);

  async function saveCurrentView(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const name=viewName.trim();
    if(!name)return;
    const response=await fetch('/api/saved-views',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        entity_type:'leads',
        name,
        filters:{query,sourceFilter,temperatureFilter},
        columns:[],
        is_default:false
      })
    });
    if(response.ok){
      setViewName('');
      setShowSaveView(false);
      setNotice('Visão salva para uso rápido.');
      await load();
    }else setError('Não foi possível salvar a visão.');
  }

  function applyView(id:string){
    if(!id){
      setQuery('');
      setSourceFilter('all');
      setTemperatureFilter('all');
      return;
    }
    const view=savedViews.find(item=>item.id===id);
    const filters=(view?.filters??{}) as Record<string,unknown>;
    setQuery(typeof filters.query==='string'?filters.query:'');
    setSourceFilter(typeof filters.sourceFilter==='string'?filters.sourceFilter:'all');
    const temp=typeof filters.temperatureFilter==='string'?filters.temperatureFilter:'all';
    setTemperatureFilter(['cold','warm','hot'].includes(temp)?temp as 'cold'|'warm'|'hot':'all');
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    const body = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? '').trim() || null,
      phone: String(form.get('phone') ?? '').trim() || null,
      source: String(form.get('source') ?? '').trim() || null,
      status: 'lead'
    };
    const response = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    setSaving(false);
    if (response.ok) {
      setOpen(false);
      setNotice('Lead criado e pronto para qualificação.');
      await load();
    } else {
      setError('Não foi possível criar o lead.');
    }
  }

  async function qualify(lead: Lead) {
    setError('');
    setNotice('');
    const response = await fetch(`/api/contacts/${lead.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'active' })
    });
    if (response.ok) {
      setNotice(`${lead.name} foi marcado como cliente ativo.`);
      await load();
    } else {
      setError('Não foi possível qualificar este lead.');
    }
  }

  async function createDeal(lead: Lead) {
    setError('');
    const response = await fetch('/api/deals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: `Oportunidade - ${lead.name}`, contact_id: lead.id, stage: 'new', value: 0, probability: 10 })
    });
    if (response.ok) window.location.href = '/app/pipeline';
    else setError('Não foi possível criar a oportunidade para este lead.');
  }

  async function createTask(lead: Lead) {
    setError('');
    setNotice('');
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: `Qualificar lead - ${lead.name}`,
        description: 'Validar necessidade, orçamento, prazo e próximo passo comercial.',
        priority: 'high',
        due_at: dueDate,
        related_contact_id: lead.id
      })
    });
    if (response.ok) setNotice(`Tarefa de qualificação criada para ${lead.name}.`);
    else setError('Não foi possível criar tarefa para este lead.');
  }

  return <div className={`content ${styles.page}`}>
    <div className={styles.hero}>
      <div>
        <h1 className="page-title">Leads</h1>
        <p className="page-sub">Entrada comercial para capturar, qualificar e converter oportunidades.</p>
      </div>
      <div className={styles.heroActions}>
        <button type="button" className="btn btn-secondary" onClick={()=>setShowSaveView(value=>!value)}>{showSaveView?'Cancelar visão':'Salvar visão'}</button>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(value => !value)}>{open ? <X size={17}/> : <Plus size={17}/>} {open ? 'Fechar' : 'Novo lead'}</button>
      </div>
    </div>

    {showSaveView&&<form className={styles.formPanel} onSubmit={saveCurrentView}>
      <div><h3>Salvar visão de leads</h3><p className={styles.sideHint}>Guarda os filtros atuais para reutilizar com um clique.</p></div>
      <div className={styles.formGrid}>
        <div className="field"><label>Nome da visão</label><input className="input" value={viewName} onChange={e=>setViewName(e.target.value)} placeholder="Ex.: Leads quentes do Meta" required/></div>
      </div>
      <div className={styles.formFooter}><button className="btn btn-primary">Salvar visão</button></div>
    </form>}

    <section className={styles.kpiGrid} aria-label="Resumo de leads">
      <article className={styles.kpi}><span className={styles.kpiIcon}><UserPlus size={18}/></span><span>Leads abertos</span><strong>{rows.length}</strong><small>aguardando qualificação</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconBlue}`}><CalendarDays size={18}/></span><span>Novos em 7 dias</span><strong>{recentCount}</strong><small>entradas recentes</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconAmber}`}><Phone size={18}/></span><span>Sem telefone</span><strong>{noPhoneCount}</strong><small>precisam de contato melhor</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconRose}`}><Target size={18}/></span><span>Origens</span><strong>{sources.length}</strong><small>canais identificados</small></article>
    </section>

    <section className={styles.toolbar} aria-label="Filtros de leads">
      <label className={styles.searchField}><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar lead, e-mail, telefone ou origem"/></label>
      <label className={styles.selectField}><Filter size={16}/><select value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}><option value="all">Todas as origens</option>{sources.map(source => <option key={source} value={source}>{source}</option>)}</select></label>
      <label className={styles.selectField}><Target size={16}/><select value={temperatureFilter} onChange={event=>setTemperatureFilter(event.target.value as 'all'|'cold'|'warm'|'hot')}><option value="all">Todas temperaturas</option><option value="hot">Quentes</option><option value="warm">Mornos</option><option value="cold">Frios</option></select></label>
    </section>
    <section className={styles.toolbar} aria-label="Visões salvas" style={{gridTemplateColumns:'minmax(260px,1fr)'}}>
      <label className={styles.selectField}><ClipboardCheck size={16}/><select defaultValue="" onChange={event=>applyView(event.target.value)}><option value="">Visão padrão</option>{savedViews.map(view=><option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
    </section>

    {error && <div className="error">{error}</div>}
    {notice && <div className="success">{notice}</div>}

    {open && <form className={styles.formPanel} onSubmit={create}>
      <div><h3>Novo lead</h3><p className={styles.sideHint}>Cadastre uma entrada comercial rápida para qualificar depois.</p></div>
      <div className={styles.formGrid}>
        <div className="field"><label>Nome</label><input className="input" name="name" required/></div>
        <div className="field"><label>E-mail</label><input className="input" type="email" name="email"/></div>
        <div className="field"><label>Telefone</label><input className="input" name="phone"/></div>
        <div className="field"><label>Origem</label><input className="input" name="source" placeholder="Instagram, formulário, indicação..."/></div>
      </div>
      <div className={styles.formFooter}><button className="btn btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar lead'}</button></div>
    </form>}

    <div className={styles.workspace}>
      <section className={styles.cardGrid} aria-label="Lista de leads">
        {filteredRows.length ? filteredRows.map(row => <article className={styles.recordCard} key={row.id}>
          <div className={styles.recordTop}>
            <div className={styles.identity}>
              <span className={styles.avatar}>{row.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span>
              <div className={styles.identityCopy}><strong>{row.name}</strong><span>{row.source || 'Sem origem'} · {ageLabel(row.created_at)}</span><span>{row.owner?.full_name ? `Responsável: ${row.owner.full_name}` : 'Aguardando responsável'}</span></div>
            </div>
            <span className={`${styles.statusBadge} ${row.lead_temperature === 'hot' ? styles.priorityHigh : row.lead_temperature === 'warm' ? styles.priorityMedium : styles.priorityLow}`}>{row.lead_temperature === 'hot' ? 'Quente' : row.lead_temperature === 'warm' ? 'Morno' : 'Frio'} · {row.lead_score ?? 0}</span>
          </div>
          <div className={styles.metaList}>
            <div className={styles.metaLine}><Mail size={15}/><span>{row.email || 'E-mail não informado'}</span></div>
            <div className={styles.metaLine}><Phone size={15}/><span>{row.phone || 'Telefone não informado'}</span></div>
          </div>
          {attributionLabel(row) && <p className={styles.recordNote}>{attributionLabel(row)}</p>}
                    <div className={styles.cardActions}>
            <button type="button" className="btn btn-secondary" onClick={() => void createTask(row)}><ClipboardCheck size={15}/>Tarefa</button>
            <button type="button" className="btn btn-secondary" onClick={() => void createDeal(row)}><BriefcaseBusiness size={15}/>Oportunidade</button>
            <button type="button" className="btn btn-primary" onClick={() => void qualify(row)}><CheckCircle2 size={15}/>Qualificar</button>
          </div>
        </article>) : <div className={styles.emptyState}>Nenhum lead encontrado com os filtros atuais.</div>}
      </section>

      <aside className={styles.sidePanel}>
        <h3>Origem dos leads</h3>
                <div className={styles.sourceList}>
          {sourceSummary.length ? sourceSummary.map(([source, count]) => <div className={styles.sourceItem} key={source}>
            <div className={styles.sourceItemTop}><strong>{source}</strong><span>{count}</span></div>
            <div className={styles.progressTrack}><i style={{ width: `${Math.max(8, (count / Math.max(1, rows.length)) * 100)}%` }}/></div>
          </div>) : <div className={styles.emptyState}>Sem leads para comparar.</div>}
        </div>
      </aside>
    </div>
  </div>;
}
