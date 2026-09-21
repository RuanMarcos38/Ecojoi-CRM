'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
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
import styles from './pipeline.module.css';

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

const stages = [
  ['new', 'Novo'],
  ['qualification', 'Qualificação'],
  ['proposal', 'Proposta'],
  ['closing', 'Fechamento'],
  ['won', 'Ganho'],
  ['lost', 'Perdido']
] as const;
const stageLabel = Object.fromEntries(stages) as Record<string, string>;
const openStages = new Set(['new', 'qualification', 'proposal', 'closing']);
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
  return openStages.has(deal.stage) && elapsedMinutes(deal.stage_changed_at) >= staleMinutes;
}

export default function Pipeline() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
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
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (selectedDealId && deals.some(deal => deal.id === selectedDealId)) return;
    setSelectedDealId(deals[0]?.id ?? null);
  }, [deals, selectedDealId]);

  const enabledByStage = useMemo(() => {
    const map: Record<string, Rule[]> = {};
    for (const rule of rules.filter(item => item.enabled)) (map[rule.stage] ??= []).push(rule);
    for (const value of Object.values(map)) value.sort((a, b) => a.wait_minutes - b.wait_minutes);
    return map;
  }, [rules]);

  const summary = useMemo(() => {
    const activeDeals = deals.filter(deal => openStages.has(deal.stage));
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
  }, [filteredDeals]);

  const selectedDeal = useMemo(() => {
    return deals.find(deal => deal.id === selectedDealId) ?? filteredDeals[0] ?? null;
  }, [deals, filteredDeals, selectedDealId]);
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

  async function move(id: string, stage: string) {
    setError(''); setNotice('');
    const r = await fetch(`/api/deals/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stage }) });
    if (!r.ok) setError('Sem permissão para alterar esta oportunidade.');
    else setNotice(`Oportunidade movida para ${stageLabel[stage]}. O tempo da nova etapa foi reiniciado.`);
    await load();
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
    const fd = new FormData(e.currentTarget);
    const value = Math.max(1, Number(fd.get('wait_value') ?? 1));
    const unit = String(fd.get('wait_unit') ?? 'days');
    const waitMinutes = unit === 'minutes' ? value : unit === 'hours' ? value * 60 : value * 1440;
    const payload = {
      name: fd.get('name'), stage: fd.get('stage'), channel: fd.get('channel'),
      wait_minutes: waitMinutes, message_template: fd.get('message_template'), enabled: true
    };
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
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setSelectedDealId(id);
  }

  return <div className={`content pipeline-page ${styles.root}`}>
    <div className="page-head">
      <div><h1 className="page-title">Pipeline Comercial</h1><p className="page-sub">Gestão de oportunidades, ritmo de follow-up e previsão comercial da operação.</p></div>
      <div className="page-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setRulesOpen(value => !value)}><Settings2 size={17}/>Automações</button>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(value => !value)}>{open ? <X size={17}/> : <Plus size={17}/>}Nova oportunidade</button>
      </div>
    </div>

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
        <div className="field"><label>Etapa</label><select className="select" name="stage">{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
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
        {newRuleOpen && <form className="automation-rule-form" onSubmit={createRule}>
          <div className="form-grid pipeline-form-grid">
            <div className="field"><label>Nome da automação</label><input className="input" name="name" required placeholder="Follow-up da proposta"/></div>
            <div className="field"><label>Etapa</label><select className="select" name="stage">{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="field"><label>Esperar</label><div className="time-rule"><input className="input" name="wait_value" type="number" min="1" defaultValue="2"/><select className="select" name="wait_unit" defaultValue="days"><option value="minutes">Minutos</option><option value="hours">Horas</option><option value="days">Dias</option></select></div></div>
            <div className="field"><label>Canal</label><select className="select" name="channel" defaultValue="internal"><option value="internal">Interno</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option></select></div>
          </div>
          <div className="field"><label>Mensagem</label><textarea className="textarea" name="message_template" rows={3} required defaultValue="Olá {{nome}}, passando para acompanhar a oportunidade {{oportunidade}}. Posso te ajudar com alguma informação?"/></div>
          <div className="template-help">Variáveis disponíveis: <code>{'{{nome}}'}</code> <code>{'{{oportunidade}}'}</code> <code>{'{{etapa}}'}</code></div>
          <button className="btn btn-primary">Salvar automação</button>
        </form>}
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

    <div className="pipeline-workspace">
      <div className="kanban kanban-six pipeline-kanban">
        {stages.map(([stage, label]) => {
          const stageDeals = groupedDeals[stage] ?? [];
          const stageValue = stageDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
          return <div className={`column stage-${stage}`} key={stage}>
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

      <aside className="pipeline-inspector" aria-live="polite">
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
      </aside>
    </div>
  </div>;
}
