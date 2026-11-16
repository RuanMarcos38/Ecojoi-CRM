'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Megaphone, Target, TrendingUp, UserPlus, WalletCards } from 'lucide-react';
import { campaignBatchSize, campaignPhone } from '@/lib/campaign-audience';
import styles from '../commercial.module.css';

type Contact = { id: string; phone?: string | null; consent_status?: string | null; consent_at?: string | null; source?: string | null; status: string; created_at?: string };
type Deal = { id: string; stage: string; value: number; contact?: { id: string; source?: string | null } | null };

function money(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function csvRows(source: string) {
  const input = source.replace(/^\uFEFF/, '');
  const delimiter = input.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (ch === delimiter || ch === '\n')) {
      row.push(cell.trim());
      cell = '';
      if (ch === '\n') { rows.push(row); row = []; }
    } else cell += ch;
  }
  if (quoted) throw new Error('invalid_csv');
  if (cell || row.length) rows.push([...row, cell.trim()]);
  return rows.filter(record => record.some(Boolean));
}

type Campaign = {
  id: string; status: 'queued' | 'paused' | 'cancelled' | 'completed';
  processing: boolean; cursor_pos: number; accepted: number; skipped: number; last_result?: string | null;
};
type ImportedAudience = { file: string; contacts: number; phones: string[] };

type TemplateOption = { id: string; name: string; language: string; status: string; category: string };

function ReactivationAudience({ contacts }: { contacts: Contact[] }) {
  const [phones, setPhones] = useState<string[]>([]);
  const [imports, setImports] = useState<ImportedAudience[] | null>(null);
  const [loadingImports, setLoadingImports] = useState(false);
  const [audienceMode, setAudienceMode] = useState<'csv' | 'crm'>('csv');
  const [importSelection, setImportSelection] = useState('');
  const [batch, setBatch] = useState(0);
  const [startedBatches, setStartedBatches] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(0);
  const [duplicates, setDuplicates] = useState(0);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [followUpStatus, setFollowUpStatus] = useState('');
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [saving, setSaving] = useState(false);
  const campaignId = useRef<string | null>(null);

  async function refreshCampaigns() {
    const response = await fetch('/api/campaigns/reactivation', { cache: 'no-store' });
    if (!response.ok) return;
    setCanManage(true);
    setCampaigns((await response.json()).data ?? []);
  }

  useEffect(() => {
    const refresh = () => { void refreshCampaigns().catch(() => {}); };
    refresh();
    void fetch('/api/integrations/meta/templates', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) return;
        const result = await response.json();
        setTemplates((result.data ?? []).filter((item: TemplateOption) => item.status === 'APPROVED' && item.category === 'MARKETING'));
      }).catch(() => {});
    void fetch('/api/integrations/meta/follow-up-template', { cache: 'no-store' })
      .then(async response => { if (response.ok) setFollowUpEnabled((await response.json()).configured); }).catch(() => {});
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, []);

  async function configureFollowUp(disable = false) {
    setFollowUpBusy(true);
    setFollowUpStatus('');
    try {
      const response = await fetch('/api/integrations/meta/follow-up-template', { method: disable ? 'DELETE' : 'POST' });
      const result = await response.json();
      if (!response.ok) throw Error();
      setFollowUpEnabled(result.configured === true);
      setFollowUpStatus(disable ? 'Follow-up desativado.' : 'Modelo na Meta · ' + result.data.status);
    } catch {
      setFollowUpStatus('Não foi possível configurar o modelo na Meta. Confira a conta oficial e as permissões da integração.');
    } finally {
      setFollowUpBusy(false);
    }
  }

  const selectedImports = (imports ?? []).filter(item => !importSelection || item.file === importSelection);
  const importedPhones = [...new Set(selectedImports.flatMap(item => item.phones))].sort();
  const batchCount = Math.ceil(importedPhones.length / campaignBatchSize);
  const batchKey = JSON.stringify([importSelection, batch, templateId]);
  const campaignPhones = audienceMode === 'crm'
    ? importedPhones.slice(batch * campaignBatchSize, (batch + 1) * campaignBatchSize)
    : phones;

  async function openImportedAudience() {
    setAudienceMode('crm');
    setConfirmed(false);
    campaignId.current = null;
    setError('');
    if (imports || loadingImports) return;
    setLoadingImports(true);
    try {
      const response = await fetch('/api/campaigns/reactivation?audience=imports', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const result = await response.json();
      setImports(result.data ?? []);
    } catch {
      setError('Não foi possível carregar os contatos importados.');
    } finally {
      setLoadingImports(false);
    }
  }

  function chooseImport(file: string, nextBatch = 0) {
    setImportSelection(file);
    setBatch(nextBatch);
    setConfirmed(false);
    campaignId.current = null;
  }

  async function mutate(action?: 'pause' | 'resume' | 'cancel', id?: string) {
    if (saving) return;
    setSaving(true); setError('');
    try {
      campaignId.current ??= crypto.randomUUID();
      const response = await fetch('/api/campaigns/reactivation', {
        method: action ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action ? { action, id } : {
          id: campaignId.current, template_id: templateId, phones: campaignPhones, marketing_opt_in_confirmed: confirmed
        })
      });
      const result = await response.json();
      if (!response.ok) {
        const messages: Record<string, string> = {
          worker_offline: 'O agendador de campanhas está indisponível. Nenhuma mensagem foi agendada.',
          approved_template_required: 'Escolha um modelo aprovado de marketing com texto fixo e instrução para responder SAIR.',
          no_eligible_contacts: 'Nenhum número da lista pode receber a campanha.',
          campaign_already_active: 'Já existe uma campanha em andamento ou pausada.',
          campaign_busy_or_closed: 'A campanha está enviando um item ou já foi encerrada. Atualize e tente novamente.',
          official_provider_required: 'Ative a API oficial do WhatsApp da Meta para usar campanhas.'
        };
        setError(messages[result.error] ?? 'Não foi possível atualizar a campanha.');
        return;
      }
      if (!action) {
        setConfirmed(false);
        if (audienceMode === 'crm') {
          campaignId.current = null;
          setStartedBatches(current => [...current, batchKey]);
        }
      }
      await refreshCampaigns();
    } catch {
      setError('Falha de conexão. Confira o status da campanha antes de tentar novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function preview(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    campaignId.current = null; setConfirmed(false);
    setPhones([]); setInvalid(0); setDuplicates(0); setFileName(''); setError('');
    if (file.size > 2 * 1024 * 1024) {
      setError('O CSV deve ter no máximo 2 MB para prévia.');
      return;
    }
    try {
      const [header, ...records] = csvRows(await file.text());
      const column = header?.findIndex(name => ['telefone', 'whatsapp', 'phone', 'celular'].includes(name.toLowerCase())) ?? -1;
      if (column < 0) { setError('Inclua no CSV uma coluna chamada telefone.'); return; }
      const numbers = records.map(record => campaignPhone(record[column] ?? ''));
      const valid = numbers.filter(Boolean);
      setPhones([...new Set(valid)]);
      setInvalid(numbers.length - valid.length);
      setDuplicates(valid.length - new Set(valid).size);
      setFileName(file.name);
    } catch {
      setError('Não foi possível ler o CSV. Confira a formatação do arquivo.');
    }
  }

  const counts = useMemo(() => {
    const byPhone = new Map<string, Contact[]>();
    for (const contact of contacts) {
      const phone = campaignPhone(contact.phone ?? '');
      if (phone) byPhone.set(phone, [...(byPhone.get(phone) ?? []), contact]);
    }
    let candidates = 0, unknown = 0, excluded = 0;
    for (const phone of phones) {
      const matches = byPhone.get(phone);
      if (!matches) unknown++;
      else if (matches.some(contact => contact.consent_status === 'opt_out')) excluded++;
      else if (matches.some(contact => contact.status !== 'inactive' && contact.consent_status === 'opt_in' && contact.consent_at)) candidates++;
      else excluded++;
    }
    return { candidates, unknown, excluded };
  }, [contacts, phones]);

  return <section className={styles.sidePanel} aria-label="Preparar reativação por WhatsApp">
    <h2>Preparar reativação por WhatsApp</h2>
    <p className={styles.sideHint}>Confira a lista antes de enviar. Confirme se o consentimento registrado cobre mensagens de marketing pelo WhatsApp.</p>
    {canManage && <div className={styles.cardActions} aria-label="Origem do público">
      <button type="button" className="btn btn-secondary" aria-pressed={audienceMode === 'crm'} disabled={saving || loadingImports}
        onClick={() => void openImportedAudience()}>Selecionar contatos importados</button>
      <button type="button" className="btn btn-secondary" aria-pressed={audienceMode === 'csv'} disabled={saving}
        onClick={() => { setAudienceMode('csv'); setConfirmed(false); setError(''); campaignId.current = null; }}>Usar lista CSV</button>
    </div>}
    {audienceMode === 'csv' ? <label>Lista CSV <input type="file" accept=".csv,text/csv" disabled={saving} onChange={event => void preview(event)}/></label> :
      <div className="field">
        <label htmlFor="imported-audience">Arquivo importado no CRM</label>
        <select id="imported-audience" className="select" value={importSelection} disabled={saving || loadingImports || !imports?.length}
          onChange={event => chooseImport(event.target.value)}>
          <option value="">Todos os contatos importados</option>
          {(imports ?? []).map(item => <option key={item.file} value={item.file}>{item.file} · {item.contacts.toLocaleString('pt-BR')} contatos</option>)}
        </select>
        {loadingImports ? <p role="status">Carregando contatos importados…</p> : imports && <p aria-live="polite">
          {selectedImports.reduce((total, item) => total + item.contacts, 0).toLocaleString('pt-BR')} contatos cadastrados · {importedPhones.length.toLocaleString('pt-BR')} números elegíveis com aceite de marketing
        </p>}
        {batchCount > 1 && <>
          <label htmlFor="imported-campaign-batch">Lote de envio</label>
          <select id="imported-campaign-batch" className="select" value={batch} disabled={saving}
            onChange={event => chooseImport(importSelection, Number(event.target.value))}>
            {Array.from({ length: batchCount }, (_, index) => <option key={index} value={index}>
              Lote {index + 1} de {batchCount} · {Math.min(campaignBatchSize, importedPhones.length - index * campaignBatchSize)} números
            </option>)}
          </select>
        </>}
        {startedBatches.includes(batchKey) && <p role="status">Este lote já foi iniciado nesta sessão.</p>}
      </div>}
    {error && <p role="alert">{error}</p>}
    {audienceMode === 'csv' && fileName && <div aria-live="polite">
      <p><strong>{fileName}</strong> · {counts.candidates} com aceite registrado</p>
      <p className={styles.sideHint}>{counts.excluded} excluídos pelo cadastro · {counts.unknown} fora do CRM · {duplicates} duplicados · {invalid} inválidos</p>
    </div>}
    {canManage && <>
      <div className="field">
        <strong>Follow-up automático após cinco dias</strong>
        <small>{followUpEnabled ? 'Configurado. A fila exige aprovação da Meta e aceite no cadastro.' : 'Disponível para leads com WhatsApp em atendimento e aceite registrado.'}</small>
        <button type="button" className="btn btn-secondary" disabled={followUpBusy} onClick={() => void configureFollowUp()}>
          {followUpEnabled ? 'Consultar modelo na Meta' : 'Enviar modelo à Meta e habilitar após aprovação'}
        </button>
        {followUpEnabled && <button type="button" className="btn btn-secondary" disabled={followUpBusy} onClick={() => void configureFollowUp(true)}>Desativar follow-up</button>}
        {followUpStatus && <p role="status">{followUpStatus}</p>}
      </div>
      <div className="field">
        <label htmlFor="reactivation-template">Modelo aprovado pela Meta</label>
        <select id="reactivation-template" className="select" value={templateId}
          disabled={saving} onChange={event => { setTemplateId(event.target.value); setConfirmed(false); campaignId.current = null; }}>
          <option value="">Selecione um modelo de marketing</option>
          {templates.map(template => <option key={template.id} value={template.id}>{template.name} · {template.language}</option>)}
        </select>
        <small>Use texto fixo com instrução para responder SAIR. O WhatsApp pode cobrar pelo envio.</small>
      </div>
      <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> Confirmo que os aceites registrados cobrem marketing da Ecojoi pelo WhatsApp.</label>
      {audienceMode === 'csv' && phones.length > campaignBatchSize && <p role="alert">Use um CSV com até 500 números únicos por campanha.</p>}
      <button type="button" className="btn btn-primary" disabled={saving || !confirmed || !templateId || !campaignPhones.length ||
        (audienceMode === 'csv' ? !counts.candidates || phones.length > campaignBatchSize : startedBatches.includes(batchKey))}
        onClick={() => void mutate()}>Iniciar campanha</button>
      {campaigns.length > 0 && <h3>Campanhas de WhatsApp</h3>}
      {campaigns.map(campaign => <article className="card section" key={campaign.id}>
        <strong>{({ queued: 'Na fila', paused: 'Pausada', cancelled: 'Cancelada', completed: 'Processada' })[campaign.status]}</strong>
        <p>{campaign.accepted} aceitas pela Meta · {campaign.skipped} ignoradas · {campaign.cursor_pos} analisadas</p>
        {campaign.last_result && <small>{campaign.last_result.replaceAll('_', ' ')}</small>}
        {(campaign.status === 'queued' || campaign.status === 'paused') && <div className={styles.cardActions}>
          <button type="button" className="btn btn-secondary" disabled={saving || campaign.processing}
            onClick={() => void mutate(campaign.status === 'queued' ? 'pause' : 'resume', campaign.id)}>{campaign.status === 'queued' ? 'Pausar' : 'Retomar'}</button>
          <button type="button" className="btn btn-secondary" disabled={saving || campaign.processing}
            onClick={() => void mutate('cancel', campaign.id)}>Cancelar</button>
        </div>}
      </article>)}
    </>}
  </section>;
}

export default function Campanhas() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/contacts', { cache: 'no-store' }),
      fetch('/api/deals', { cache: 'no-store' })
    ])
      .then(async ([contactsResponse, dealsResponse]) => {
        const [contactsPayload, dealsPayload] = await Promise.all([contactsResponse.json(), dealsResponse.json()]);
        if (!contactsResponse.ok || !dealsResponse.ok) throw new Error('campaigns_fetch_failed');
        setContacts(contactsPayload.data ?? []);
        setDeals(dealsPayload.data ?? []);
      })
      .catch(() => setError('Não foi possível carregar dados de campanhas.'));
  }, []);

  const rows = useMemo(() => {
    const sources = new Map<string, { leads: number; active: number; deals: number; revenue: number }>();
    for (const contact of contacts) {
      const source = contact.source?.trim() || 'Não informado';
      const row = sources.get(source) ?? { leads: 0, active: 0, deals: 0, revenue: 0 };
      row.leads += contact.status === 'lead' ? 1 : 0;
      row.active += contact.status === 'active' ? 1 : 0;
      sources.set(source, row);
    }
    for (const deal of deals) {
      const source = deal.contact?.source?.trim() || 'Não informado';
      const row = sources.get(source) ?? { leads: 0, active: 0, deals: 0, revenue: 0 };
      row.deals += 1;
      if (deal.stage === 'won') row.revenue += Number(deal.value || 0);
      sources.set(source, row);
    }
    return [...sources.entries()].map(([source, row]) => ({ source, ...row })).sort((a, b) => b.leads + b.deals - (a.leads + a.deals));
  }, [contacts, deals]);

  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalLeads = rows.reduce((sum, row) => sum + row.leads, 0);

  return <div className={`content ${styles.page}`}>
    <div className={styles.hero}>
      <div>
        <h1 className="page-title">Campanhas</h1>
        <p className="page-sub">Atribuição comercial do caminho campanha, atendimento, oportunidade, venda e receita.</p>
      </div>
    </div>

    {!error && <ReactivationAudience contacts={contacts}/>}

    <section className={styles.kpiGrid}>
      <article className={styles.kpi}><span className={styles.kpiIcon}><Megaphone size={18}/></span><span>Origens</span><strong>{rows.length}</strong><small>canais rastreados</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconBlue}`}><UserPlus size={18}/></span><span>Leads</span><strong>{totalLeads}</strong><small>por fonte declarada</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconAmber}`}><Target size={18}/></span><span>Oportunidades</span><strong>{deals.length}</strong><small>no pipeline</small></article>
      <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.kpiIconRose}`}><WalletCards size={18}/></span><span>Receita</span><strong>{money(totalRevenue)}</strong><small>fechado ganho</small></article>
    </section>

    {error ? <div className="error">{error}</div> : <section className={styles.workspace}>
      <div className={styles.tableShell}>
        <table className="table">
          <thead><tr><th>Origem/Campanha</th><th>Leads</th><th>Clientes ativos</th><th>Oportunidades</th><th>Receita</th><th>Conversão</th></tr></thead>
          <tbody>
            {rows.length ? rows.map(row => <tr key={row.source}>
              <td><strong>{row.source}</strong></td>
              <td>{row.leads}</td>
              <td>{row.active}</td>
              <td>{row.deals}</td>
              <td>{money(row.revenue)}</td>
              <td>{row.leads ? `${Math.round((row.deals / row.leads) * 100)}%` : '-'}</td>
            </tr>) : <tr><td colSpan={6}>Sem dados de campanha ainda.</td></tr>}
          </tbody>
        </table>
      </div>
      <aside className={styles.sidePanel}>
        <h3>Atribuição</h3>
        <p className={styles.sideHint}>Os campos de origem, campanha e UTMs devem chegar pelos webhooks de formulários, anúncios e WhatsApp para calcular CPL, CAC e ROAS.</p>
        <div className={styles.sideMetric}><span>Receita atribuída</span><strong>{money(totalRevenue)}</strong></div>
        <div className={styles.sideMetric}><span>Conversão média</span><strong>{totalLeads ? Math.round((deals.length / totalLeads) * 100) : 0}%</strong></div>
        <div className={styles.sourceList}>
          {rows.slice(0, 4).map(row => <div className={styles.sourceItem} key={row.source}>
            <div className={styles.sourceItemTop}><span>{row.source}</span><b>{row.leads + row.deals}</b></div>
            <div className={styles.progressTrack}><i style={{ width: `${Math.min(100, Math.max(8, (row.leads + row.deals) * 12))}%` }}/></div>
          </div>)}
        </div>
      </aside>
    </section>}
    <section className={styles.sidePanel}>
      <h3><BarChart3 size={16}/> Métricas previstas</h3>
      <p className={styles.sideHint}><TrendingUp size={14}/> CPL, CAC e ROAS dependem do investimento importado das plataformas de mídia. A estrutura de atribuição já está separada para receber esses dados.</p>
    </section>
  </div>;
}
