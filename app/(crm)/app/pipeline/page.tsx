'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Filter,
  Mail,
  MessageSquareText,
  PanelRightOpen,
  Phone,
  Plus,
  Search,
  Settings2,
  TimerReset,
  Trash2,
  TrendingUp,
  UserRound,
  X
} from 'lucide-react';
import PipelineRuleForm, { pipelineRulePayload } from '@/components/PipelineRuleForm';
import styles from './pipeline.module.css';
import { standardPipeline, type PipelineDefinition } from '@/lib/pipelines';

type Deal = {
  id: string;
  title: string;
  stage: string;
  value: number;
  probability: number;
  contact_id?: string | null;
  stage_changed_at: string;
  created_at?: string;
  updated_at?: string;
  contact?: { id: string; name: string; phone?: string; email?: string } | null;
};
type Contact = { id: string; name: string; phone?: string; email?: string };
type Rule = {
  id: string;
  name: string;
  stage: string;
  wait_minutes: number;
  channel: 'internal' | 'whatsapp' | 'email';
  message_template: string;
  enabled: boolean;
};

function isOpenStage(stage: string) {
  return stage !== 'won' && stage !== 'lost';
}
const staleMinutes = 48 * 60;
type FocusFilter = 'all' | 'stalled' | 'no-contact' | 'automation';

function elapsedMinutes(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 60000));
}
function elapsedLabel(value: string) {
  const minutes = elapsedMinutes(value);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
function waitLabel(minutes: number) {
  if (minutes % 1440 === 0) return `${minutes / 1440} dia${minutes / 1440 === 1 ? '' : 's'}`;
  if (minutes % 60 === 0) return `${minutes / 60} hora${minutes / 60 === 1 ? '' : 's'}`;
  return `${minutes} min`;
}
function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function compactCurrency(value: number) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1000000) return `${(amount / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(amount) >= 1000) return `${(amount / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return formatCurrency(amount);
}
function isStalled(deal: Deal) {
  return isOpenStage(deal.stage) && elapsedMinutes(deal.stage_changed_at) >= staleMinutes;
}

export default function Pipeline() {
  const [allDeals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allRules, setRules] = useState<Rule[]>([]);
  const [open, setOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [newRuleOpen, setNewRuleOpen] = useState(false);
  const [rulesAllowed, setRulesAllowed] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [focusFilter, setFocusFilter] = useState<FocusFilter>('all');
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [pipelineId, setPipelineId] = useState(standardPipeline.id);
  const [pipelineFormOpen, setPipelineFormOpen] = useState(false);
  const [savingPipeline, setSavingPipeline] = useState(false);
  const [stageNames, setStageNames] = useState(['']);
  const pipeline = pipelines.find(item => item.id === pipelineId) ?? standardPipeline;
  const stages = useMemo(() => pipeline.stages.map(({ id, name }) => [id, name] as const), [pipeline]);
  const stageLabel = useMemo(() => Object.fromEntries(stages) as Record<string, string>, [stages]);
  const deals = useMemo(() => allDeals.filter(deal => Object.hasOwn(stageLabel, deal.stage)), [allDeals, stageLabel]);
  const rules = useMemo(() => allRules.filter(rule => Object.hasOwn(stageLabel, rule.stage)), [allRules, stageLabel]);

  function changePipeline(id: string) {
    setPipelineId(id);
    setStageFilter('all');
    setSelectedDealId(null);
  }

  async function createPipeline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get('name');
    setSavingPipeline(true);
    setError('');
    try {
      const response = await fetch('/api/pipelines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, stages: stageNames })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível criar o funil.');
      setPipelines(current => [...current, result.data]);
      changePipeline(result.data.id);
      setStageNames(['']);
      setPipelineFormOpen(false);
      setNotice('Funil criado.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível criar o funil.');
    } finally {
      setSavingPipeline(false);
    }
  }

  async function load() {
    const [dr, cr, rr] = await Promise.all([
      fetch('/api/deals', { cache: 'no-store' }),
      fetch('/api/contacts', { cache: 'no-store' }),
      fetch('/api/pipeline-rules', { cache: 'no-store' })
    ]);
    const [dd, cd, rd] = await Promise.all([dr.json(), cr.json(), rr.json()]);
    if (dr.ok) setDeals(dd.data ?? []); else setError('Não foi possível carregar o pipeline.');
    if (cr.ok) setContacts(cd.data ?? []);
    if (rr.ok) { setRules(rd.data ?? []); setRulesAllowed(true); }
    else if (rr.status === 403) { setRulesAllowed(false); setRules([]); }
  }
  useEffect(() => {
    void load();
    void fetch('/api/pipelines', { cache: 'no-store' }).then(async response => {
      if (!response.ok) return;
      setPipelines((await response.json()).data ?? []);
    }).catch(() => {});
    async function refreshDeals() {
      if (document.visibilityState !== 'visible') return;
      const response = await fetch('/api/deals', { cache: 'no-store' });
      if (response.ok) setDeals((await response.json()).data ?? []);
    }
    const refresh = () => { void refreshDeals().catch(() => {}); };
    const timer = window.setInterval(refresh, 20000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  useEffect(() => {
    if (selectedDealId && !deals.some(deal => deal.id === selectedDealId)) setSelectedDealId(null);
  }, [deals, selectedDealId]);

  const enabledByStage = useMemo(() => {
    const map: Record<string, Rule[]> = {};
    for (const rule of rules.filter(item => item.enabled)) (map[rule.stage] ??= []).push(rule);
    for (const value of Object.values(map)) value.sort((a, b) => a.wait_minutes - b.wait_minutes);
    return map;
  }, [rules]);

  const summary = useMemo(() => {
    const activeDeals = deals.filter(deal => isOpenStage(deal.stage));
    const activeValue = activeDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
    const weightedValue = activeDeals.reduce((sum, deal) => sum + (Number(deal.value || 0) * Number(deal.probability || 0)) / 100, 0);
    const averageProbability = activeDeals.length
      ? Math.round(activeDeals.reduce((sum, deal) => sum + Number(deal.probability || 0), 0) / activeDeals.length)
      : 0;
    return {
      activeCount: activeDeals.length,
      activeValue,
      weightedValue,
      averageProbability,
      stalledCount: activeDeals.filter(isStalled).length,
      withoutContact: activeDeals.filter(deal => !deal.contact_id).length
    };
  }, [deals]);

  const filteredDeals = useMemo(() => {
    const term = query.trim().toLowerCase();
    return deals.filter(deal => {
      const searchable = [deal.title, deal.contact?.name, deal.contact?.phone, deal.contact?.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesQuery = !term || searchable.includes(term);
      const matchesStage = stageFilter === 'all' || deal.stage === stageFilter;
      const matchesFocus = focusFilter === 'all'
        || (focusFilter === 'stalled' && isStalled(deal))
        || (focusFilter === 'no-contact' && !deal.contact_id)
        || (focusFilter === 'automation' && (enabledByStage[deal.stage]?.length ?? 0) > 0);
      return matchesQuery && matchesStage && matchesFocus;
    });
  }, [deals, enabledByStage, focusFilter, query, stageFilter]);

  const groupedDeals = useMemo(() => {
    const map = Object.fromEntries(stages.map(([stage]) => [stage, [] as Deal[]])) as Record<string, Deal[]>;
    for (const deal of filteredDeals) (map[deal.stage] ??= []).push(deal);
    return map;
  }, [filteredDeals, stages]);

  const selectedDeal = useMemo(() => {
    return deals.find(deal => deal.id === selectedDealId) ?? null;
  }, [deals, selectedDealId]);
  const selectedRules = selectedDeal ? enabledByStage[selectedDeal.stage] ?? [] : [];
  const selectedElapsedMinutes = selectedDeal ? elapsedMinutes(selectedDeal.stage_changed_at) : 0;
  const selectedNextRule = selectedDeal ? selectedRules.find(rule => rule.wait_minutes > selectedElapsedMinutes) : undefined;

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setNotice('');
    const fd = new FormData(e.currentTarget);
    const body: Record<string, FormDataEntryValue> = Object.fromEntries(fd.entries());
    if (!body.contact_id) delete body.contact_id;
    const r = await fetch('/api/deals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await r.json().catch(() => null);
    if (r.ok) {
      setOpen(false);
      setNotice('Oportunidade criada. O contador da etapa começou agora.');
      await load();
      setSelectedDealId(payload?.data?.id ?? null);
    }
    else setError('Não foi possível criar a oportunidade.');
  }

  const movingDeals = useRef(new Set<string>());
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);

  function endDrag() {
    setDraggedDealId(null);
    setDropStage(null);
  }

  async function move(id: string, stage: string) {
    if (movingDeals.current.has(id) || deals.find(deal => deal.id === id)?.stage === stage) return;
    movingDeals.current.add(id);
    setError(''); setNotice('');
    try {
      const r = await fetch(`/api/deals/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stage }) });
      if (!r.ok) {
        setError(r.status === 403 ? 'Sem permissão para alterar esta oportunidade.' : 'Não foi possível salvar a etapa da oportunidade.');
        return;
      }
      const { data } = await r.json();
      setDeals(current => current.map(deal => deal.id === id ? { ...deal, ...data } : deal));
      setNotice(`Oportunidade movida para ${stageLabel[stage]}.`);
    } catch {
      setError('Falha de conexão ao mover a oportunidade. Confira a etapa antes de tentar novamente.');
    } finally {
      movingDeals.current.delete(id);
    }
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta oportunidade?')) return;
    const r = await fetch(`/api/deals/${id}`, { method: 'DELETE' });
    if (!r.ok) setError('Sem permissão para excluir esta oportunidade.');
    if (selectedDealId === id) setSelectedDealId(null);
    await load();
  }

  async function createRule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setNotice('');
    const payload = pipelineRulePayload(e.currentTarget);
    const r = await fetch('/api/pipeline-rules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (r.ok) { setNewRuleOpen(false); setNotice('Automação criada. A verificação ocorre automaticamente a cada 5 minutos.'); await load(); }
    else setError('Não foi possível criar a automação. Verifique sua permissão.');
  }

  async function toggleRule(rule: Rule) {
    const r = await fetch(`/api/pipeline-rules/${rule.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: !rule.enabled }) });
    if (!r.ok) setError('Não foi possível alterar esta automação.');
    await load();
  }

  async function deleteRule(id: string) {
    if (!confirm('Excluir esta automação?')) return;
    const r = await fetch(`/api/pipeline-rules/${id}`, { method: 'DELETE' });
    if (!r.ok) setError('Não foi possível excluir esta automação.');
    await load();
  }

  function selectDealFromKeyboard(event: KeyboardEvent<HTMLElement>, id: string) {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    setSelectedDealId(id);
  }

  return <div className={`content pipeline-page ${styles.root}`}>
    <div className="page-head">
      <div><h1 className="page-title">Pipeline Comercial</h1><p className="page-sub">Gestão de oportunidades, ritmo de follow-up e previsão comercial da operação.</p></div>
      <div className="page-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setPipelineFormOpen(value => !value)}><Plus size={17}/>Criar funil</button>
        <button type="button" className="btn btn-secondary" onClick={() => setRulesOpen(value => !value)}><Settings2 size={17}/>Automações</button>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(value => !value)}>{open ? <X size={17}/> : <Plus size={17}/>}Nova oportunidade</button>
      </div>
    </div>

    <div className="field">
      <label htmlFor="commercial-pipeline">Funil</label>
      <select id="commercial-pipeline" className="select" value={pipeline.id} onChange={event => changePipeline(event.target.value)}>
        {[standardPipeline, ...pipelines].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </div>
    {pipelineFormOpen && <form className="card section" onSubmit={createPipeline}>
      <h2>Novo funil</h2>
      <div className="field"><label htmlFor="custom-pipeline-name">Nome do funil</label>
        <input id="custom-pipeline-name" className="input" name="name" minLength={2} maxLength={100} required disabled={savingPipeline}/>
      </div>
      {stageNames.map((name, index) => <div className="field" key={index}>
        <label htmlFor={`custom-stage-${index}`}>Etapa {index + 1}</label>
        <div className="page-actions">
          <input className="input" id={`custom-stage-${index}`} value={name} maxLength={80} required disabled={savingPipeline}
            onChange={event => setStageNames(current => current.map((value, position) => position === index ? event.target.value : value))}/>
          {[-1, 1].map(direction => <button className="btn btn-secondary" type="button" key={direction}
            disabled={savingPipeline || index + direction < 0 || index + direction >= stageNames.length}
            aria-label={`Mover etapa ${index + 1} para ${direction < 0 ? 'cima' : 'baixo'}`}
            onClick={() => setStageNames(current => {
              const next = [...current];
              [next[index], next[index + direction]] = [next[index + direction], next[index]];
              return next;
            })}>{direction < 0 ? '↑' : '↓'}</button>)}
          <button className="btn btn-secondary" type="button" disabled={savingPipeline || stageNames.length === 1}
            aria-label={`Remover etapa ${index + 1}`}
            onClick={() => setStageNames(current => current.filter((_, position) => position !== index))}><Trash2 size={15}/></button>
        </div>
      </div>)}
      <div className="page-actions">
        <button className="btn btn-secondary" type="button" disabled={savingPipeline || stageNames.length >= 30}
          onClick={() => setStageNames(current => [...current, ''])}>Adicionar etapa</button>
        <button className="btn btn-primary" type="submit" disabled={savingPipeline}>{savingPipeline ? 'Salvando…' : 'Salvar funil'}</button>
      </div>
    </form>}
    <section className="pipeline-summary-grid" aria-label="Resumo do pipeline">
      <article className="pipeline-summary-card">
        <div className="summary-icon green"><CircleDollarSign size={18}/></div>
        <span>Pipeline ativo</span>
        <strong>{compactCurrency(summary.activeValue)}</strong>
        <small>{summary.activeCount} oportunidades abertas</small>
      </article>
      <article className="pipeline-summary-card">
        <div className="summary-icon blue"><TrendingUp size={18}/></div>
        <span>Previsão ponderada</span>
        <strong>{compactCurrency(summary.weightedValue)}</strong>
        <small>{summary.averageProbability}% de probabilidade média</small>
      </article>
      <article className="pipeline-summary-card">
        <div className="summary-icon amber"><TimerReset size={18}/></div>
        <span>Sem avanço</span>
        <strong>{summary.stalledCount}</strong>
        <small>paradas há mais de 48h</small>
      </article>
      <article className="pipeline-summary-card">
        <div className="summary-icon rose"><UserRound size={18}/></div>
        <span>Sem contato</span>
        <strong>{summary.withoutContact}</strong>
        <small>precisam de pessoa vinculada</small>
      </article>
    </section>

    <section className="pipeline-command-bar" aria-label="Filtros do pipeline">
      <label className="pipeline-search-field">
        <Search size={17}/>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar oportunidade, contato, telefone ou e-mail" />
      </label>
      <label className="pipeline-filter-field">
        <Filter size={16}/>
        <select value={stageFilter} onChange={event => setStageFilter(event.target.value)} aria-label="Filtrar por etapa">
          <option value="all">Todas as etapas</option>
          {stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="pipeline-filter-field">
        <AlertTriangle size={16}/>
        <select value={focusFilter} onChange={event => setFocusFilter(event.target.value as FocusFilter)} aria-label="Filtrar por atenção">
          <option value="all">Todos os focos</option>
          <option value="stalled">Sem avanço 48h+</option>
          <option value="no-contact">Sem contato vinculado</option>
          <option value="automation">Com automação ativa</option>
        </select>
      </label>
    </section>

    {error && <div className="error pipeline-feedback">{error}</div>}
    {notice && <div className="success pipeline-feedback">{notice}</div>}

    {open && <form className="card section pipeline-form" onSubmit={create}>
      <div className="section-head"><div><h3>Nova oportunidade</h3><p>Vincule um contato para permitir mensagens automáticas.</p></div></div>
      <div className="form-grid pipeline-form-grid">
        <div className="field"><label>Título</label><input className="input" name="title" required placeholder="Ex.: Proposta Ecojoi"/></div>
        <div className="field"><label>Contato</label><select className="select" name="contact_id" defaultValue=""><option value="">Sem contato vinculado</option>{contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></div>
        <div className="field"><label>Valor</label><input className="input" name="value" type="number" min="0" step="0.01" defaultValue="0"/></div>
        <div className="field"><label>Etapa</label><select key={pipeline.id} className="select" name="stage">{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="field"><label>Probabilidade (%)</label><input className="input" name="probability" type="number" min="0" max="100" defaultValue="10"/></div>
      </div>
      <button className="btn btn-primary">Salvar oportunidade</button>
    </form>}

    {rulesOpen && <section className="card section pipeline-automation-panel">
      <div className="section-head">
        <div><h3>Mensagens automáticas por etapa</h3><p>Programe o envio conforme a etapa e o tempo de permanência da oportunidade.</p></div>
        {rulesAllowed && <button type="button" className="btn btn-primary" onClick={() => setNewRuleOpen(value => !value)}><Plus size={16}/>Nova automação</button>}
      </div>
      {!rulesAllowed ? <div className="empty">Seu perfil pode visualizar o pipeline, mas não gerenciar automações.</div> : <>
        {newRuleOpen && <PipelineRuleForm key={pipeline.id} stages={stages} onSubmit={createRule}/>}
        <div className="automation-rule-list">
          {rules.length === 0 ? <div className="empty">Nenhuma automação configurada.</div> : rules.map(rule => <article key={rule.id} className={`automation-rule ${rule.enabled ? '' : 'automation-rule-off'}`}>
            <div className="automation-rule-icon"><Bot size={18}/></div>
            <div className="automation-rule-copy"><strong>{rule.name}</strong><span>{stageLabel[rule.stage]} · após {waitLabel(rule.wait_minutes)} · {rule.channel}</span><p>{rule.message_template}</p></div>
            <div className="automation-rule-actions"><button type="button" className={`btn ${rule.enabled ? 'btn-secondary' : 'btn-primary'}`} onClick={() => toggleRule(rule)}>{rule.enabled ? 'Pausar' : 'Ativar'}</button><button type="button" className="btn btn-danger icon-btn" onClick={() => deleteRule(rule.id)} aria-label="Excluir automação"><Trash2 size={14}/></button></div>
          </article>)}
        </div>
        <p className="automation-note"><Clock3 size={14}/>O CRM verifica regras a cada 5 minutos. Em canais externos, a mensagem fica na fila até a API oficial daquele canal estar conectada.</p>
      </>}
    </section>}

    <div className={`pipeline-workspace ${selectedDeal ? "pipeline-workspace-selected" : ""}`}>
      <div className="kanban kanban-six pipeline-kanban">
        {stages.map(([stage, label]) => {
          const stageDeals = groupedDeals[stage] ?? [];
          const stageValue = stageDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
          return <div
            className={`column stage-${stage} ${dropStage === stage ? styles.dropTarget : ''}`}
            key={stage}
            onDragOver={event => {
              if (!draggedDealId || deals.find(deal => deal.id === draggedDealId)?.stage === stage) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropStage(stage);
            }}
            onDragLeave={event => {
              if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
              setDropStage(current => current === stage ? null : current);
            }}
            onDrop={event => {
              if (!draggedDealId) return;
              event.preventDefault();
              endDrag();
              void move(draggedDealId, stage);
            }}
          >
            <div className="column-head"><div><span>{label}</span><small>{formatCurrency(stageValue)}</small></div><span className="badge">{stageDeals.length}</span></div>
            {(enabledByStage[stage]?.length ?? 0) > 0 && <div className="stage-automation-hint"><Bot size={13}/>{enabledByStage[stage].length} automação{enabledByStage[stage].length === 1 ? '' : 'ões'}</div>}
            {stageDeals.length === 0 && <div className="column-empty">Nenhuma oportunidade</div>}
            {stageDeals.map(deal => {
              const stageRules = enabledByStage[stage] ?? [];
              const currentElapsedMinutes = elapsedMinutes(deal.stage_changed_at);
              const nextRule = stageRules.find(rule => rule.wait_minutes > currentElapsedMinutes);
              return <article
                className={`deal pipeline-deal ${selectedDeal?.id === deal.id ? 'pipeline-deal-selected' : ''} ${isStalled(deal) ? 'pipeline-deal-stalled' : ''}`}
                key={deal.id}
                tabIndex={0}
                draggable
                onDragStart={event => {
                  if (event.target !== event.currentTarget || movingDeals.current.has(deal.id)) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', deal.id);
                  setDraggedDealId(deal.id);
                }}
                onDragEnd={endDrag}
                onClick={() => setSelectedDealId(deal.id)}
                onKeyDown={event => selectDealFromKeyboard(event, deal.id)}
              >
                <div className="deal-title-row"><strong>{deal.title}</strong><button type="button" className="btn btn-danger icon-btn mini-btn" onClick={event => { event.stopPropagation(); void remove(deal.id); }} title="Excluir" aria-label="Excluir oportunidade"><Trash2 size={13}/></button></div>
                <div className="deal-contact">{deal.contact?.name ?? 'Sem contato vinculado'}</div>
                <div className="deal-kpis"><span><b>{deal.probability}%</b> prob.</span><span><b>{elapsedLabel(deal.stage_changed_at)}</b> na etapa</span></div>
                <div className="deal-value">{formatCurrency(deal.value)}</div>
                {isStalled(deal) && <div className="deal-alert"><AlertTriangle size={13}/><span>Sem avanço há {elapsedLabel(deal.stage_changed_at)}</span></div>}
                {nextRule ? <div className="deal-next-message"><MessageSquareText size={13}/><span>Próximo envio em {waitLabel(Math.max(1, nextRule.wait_minutes - currentElapsedMinutes))}</span></div> : stageRules.length > 0 ? <div className="deal-next-message completed"><Bot size={13}/><span>Regra de tempo alcançada</span></div> : null}
                <select className="select compact-select" value={deal.stage} onClick={event => event.stopPropagation()} onChange={event => { event.stopPropagation(); void move(deal.id, event.target.value); }} aria-label="Mover oportunidade entre etapas">{stages.map(([value, stageName]) => <option key={value} value={value}>{stageName}</option>)}</select>
              </article>;
            })}
          </div>;
        })}
      </div>

      {selectedDeal && <aside className="pipeline-inspector" aria-live="polite">
        {selectedDeal ? <>
          <div className="inspector-head">
            <div><span>Negócio selecionado</span><h2>{selectedDeal.title}</h2></div>
            <button type="button" className="btn btn-secondary icon-btn" onClick={() => setSelectedDealId(null)} aria-label="Fechar detalhes"><X size={16}/></button>
          </div>
          <div className="inspector-value-card">
            <span>Valor estimado</span>
            <strong>{formatCurrency(selectedDeal.value)}</strong>
            <small>{selectedDeal.probability}% de probabilidade · {formatCurrency((Number(selectedDeal.value || 0) * Number(selectedDeal.probability || 0)) / 100)} ponderado</small>
          </div>
          <div className="inspector-meta-list">
            <div><UserRound size={16}/><span>{selectedDeal.contact?.name ?? 'Sem contato vinculado'}</span></div>
            <div><Phone size={16}/><span>{selectedDeal.contact?.phone ?? 'Telefone não informado'}</span></div>
            <div><Mail size={16}/><span>{selectedDeal.contact?.email ?? 'E-mail não informado'}</span></div>
            <div><CalendarClock size={16}/><span>{stageLabel[selectedDeal.stage]} há {elapsedLabel(selectedDeal.stage_changed_at)}</span></div>
          </div>
          {isStalled(selectedDeal) && <div className="inspector-alert"><AlertTriangle size={16}/><span>Essa oportunidade precisa de uma próxima ação para sair da inércia.</span></div>}
          <div className="inspector-stage-control">
            <label>Etapa atual</label>
            <select className="select" value={selectedDeal.stage} onChange={event => void move(selectedDeal.id, event.target.value)}>{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>
          {pipeline.id === standardPipeline.id && isOpenStage(selectedDeal.stage) && <div className="inspector-stage-control">
            <button type="button" className="btn btn-primary" onClick={() => void move(selectedDeal.id, 'won')}>Marcar como ganha</button>
            <button type="button" className="btn btn-secondary" onClick={() => void move(selectedDeal.id, 'lost')}>Marcar como perdida</button>
          </div>}
          <div className="inspector-rules">
            <div className="inspector-section-title"><Bot size={15}/><strong>Automações da etapa</strong></div>
            {selectedRules.length === 0 ? <p>Nenhuma automação ativa nesta etapa.</p> : selectedRules.map(rule => <div className="inspector-rule" key={rule.id}>
              <strong>{rule.name}</strong>
              <span>{rule.channel} · após {waitLabel(rule.wait_minutes)}</span>
            </div>)}
            {selectedNextRule && <div className="inspector-next"><MessageSquareText size={15}/><span>Próxima mensagem em {waitLabel(Math.max(1, selectedNextRule.wait_minutes - selectedElapsedMinutes))}</span></div>}
          </div>
        </> : <div className="inspector-empty">
          <div className="inspector-empty-icon"><PanelRightOpen size={24}/></div>
          <strong>Selecione uma oportunidade</strong>
          <span>Os detalhes do negócio aparecem aqui.</span>
        </div>}
      </aside>}
    </div>
  </div>;
}
