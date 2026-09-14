'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Bot, Clock3, MessageSquareText, Plus, Settings2, Trash2, X } from 'lucide-react';

type Deal = {
  id: string;
  title: string;
  stage: string;
  value: number;
  probability: number;
  contact_id?: string | null;
  stage_changed_at: string;
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
  ['new','Novo'],['qualification','Qualificação'],['proposal','Proposta'],['closing','Fechamento'],['won','Ganho'],['lost','Perdido']
] as const;
const stageLabel = Object.fromEntries(stages) as Record<string, string>;

function elapsedLabel(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
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

  const enabledByStage = useMemo(() => {
    const map: Record<string, Rule[]> = {};
    for (const rule of rules.filter(item => item.enabled)) (map[rule.stage] ??= []).push(rule);
    for (const value of Object.values(map)) value.sort((a,b) => a.wait_minutes - b.wait_minutes);
    return map;
  }, [rules]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setNotice('');
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    if (!body.contact_id) delete body.contact_id;
    const r = await fetch('/api/deals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) { setOpen(false); setNotice('Oportunidade criada. O contador da etapa começou agora.'); await load(); }
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

  return <div className="content pipeline-page">
    <div className="page-head">
      <div><h1 className="page-title">Pipeline Comercial</h1><p className="page-sub">Oportunidades, tempo em etapa e mensagens automáticas em uma única operação.</p></div>
      <div className="page-actions">
        <button className="btn btn-secondary" onClick={() => setRulesOpen(v => !v)}><Settings2 size={17}/>Automações</button>
        <button className="btn btn-primary" onClick={() => setOpen(v => !v)}>{open ? <X size={17}/> : <Plus size={17}/>}Nova oportunidade</button>
      </div>
    </div>

    {error && <div className="error pipeline-feedback">{error}</div>}
    {notice && <div className="success pipeline-feedback">{notice}</div>}

    {open && <form className="card section pipeline-form" onSubmit={create}>
      <div className="section-head"><div><h3>Nova oportunidade</h3><p>Vincule um contato para permitir mensagens automáticas.</p></div></div>
      <div className="form-grid pipeline-form-grid">
        <div className="field"><label>Título</label><input className="input" name="title" required placeholder="Ex.: Proposta Ecojoi"/></div>
        <div className="field"><label>Contato</label><select className="select" name="contact_id" defaultValue=""><option value="">Sem contato vinculado</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Valor</label><input className="input" name="value" type="number" min="0" step="0.01" defaultValue="0"/></div>
        <div className="field"><label>Etapa</label><select className="select" name="stage">{stages.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label>Probabilidade (%)</label><input className="input" name="probability" type="number" min="0" max="100" defaultValue="10"/></div>
      </div>
      <button className="btn btn-primary">Salvar oportunidade</button>
    </form>}

    {rulesOpen && <section className="card section pipeline-automation-panel">
      <div className="section-head">
        <div><h3>Mensagens automáticas por etapa</h3><p>Programe o envio conforme a etapa e o tempo de permanência da oportunidade.</p></div>
        {rulesAllowed && <button className="btn btn-primary" onClick={() => setNewRuleOpen(v => !v)}><Plus size={16}/>Nova automação</button>}
      </div>
      {!rulesAllowed ? <div className="empty">Seu perfil pode visualizar o pipeline, mas não gerenciar automações.</div> : <>
        {newRuleOpen && <form className="automation-rule-form" onSubmit={createRule}>
          <div className="form-grid pipeline-form-grid">
            <div className="field"><label>Nome da automação</label><input className="input" name="name" required placeholder="Follow-up da proposta"/></div>
            <div className="field"><label>Etapa</label><select className="select" name="stage">{stages.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>
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
            <div className="automation-rule-actions"><button className={`btn ${rule.enabled ? 'btn-secondary' : 'btn-primary'}`} onClick={() => toggleRule(rule)}>{rule.enabled ? 'Pausar' : 'Ativar'}</button><button className="btn btn-danger icon-btn" onClick={() => deleteRule(rule.id)} aria-label="Excluir automação"><Trash2 size={14}/></button></div>
          </article>)}
        </div>
        <p className="automation-note"><Clock3 size={14}/>O CRM verifica regras a cada 5 minutos. Em canais externos, a mensagem fica “na fila” até a API oficial daquele canal estar conectada.</p>
      </>}
    </section>}

    <div className="kanban kanban-six pipeline-kanban">
      {stages.map(([stage,label]) => <div className={`column stage-${stage}`} key={stage}>
        <div className="column-head"><span>{label}</span><span className="badge">{deals.filter(d => d.stage === stage).length}</span></div>
        {(enabledByStage[stage]?.length ?? 0) > 0 && <div className="stage-automation-hint"><Bot size={13}/>{enabledByStage[stage].length} automação{enabledByStage[stage].length === 1 ? '' : 'ões'}</div>}
        {deals.filter(d => d.stage === stage).map(deal => {
          const stageRules = enabledByStage[stage] ?? [];
          const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(deal.stage_changed_at).getTime()) / 60000));
          const nextRule = stageRules.find(rule => rule.wait_minutes > elapsedMinutes);
          return <article className="deal pipeline-deal" key={deal.id}>
            <div className="deal-title-row"><strong>{deal.title}</strong><button className="btn btn-danger icon-btn mini-btn" onClick={() => remove(deal.id)} title="Excluir"><Trash2 size={13}/></button></div>
            <div className="deal-contact">{deal.contact?.name ?? 'Sem contato vinculado'}</div>
            <div className="deal-kpis"><span><b>{deal.probability}%</b> prob.</span><span><b>{elapsedLabel(deal.stage_changed_at)}</b> na etapa</span></div>
            <div className="deal-value">{Number(deal.value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div>
            {nextRule ? <div className="deal-next-message"><MessageSquareText size={13}/><span>Próximo envio em {waitLabel(Math.max(1,nextRule.wait_minutes - elapsedMinutes))}</span></div> : stageRules.length > 0 ? <div className="deal-next-message completed"><Bot size={13}/><span>Regra de tempo alcançada</span></div> : null}
            <select className="select compact-select" value={deal.stage} onChange={e => void move(deal.id,e.target.value)}>{stages.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select>
          </article>;
        })}
      </div>)}
    </div>
  </div>;
}
