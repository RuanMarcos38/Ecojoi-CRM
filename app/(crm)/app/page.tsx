'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock3, FileSpreadsheet, FileText, ListTodo,
  MessagesSquare, TrendingUp, UserPlus, Users, WalletCards
} from 'lucide-react';
import styles from './dashboard.module.css';

type Breakdown = { count: number };
type Data = {
  periodDays: number;
  activeContacts: number;
  leads: number;
  openConversations: number;
  conversion: number;
  openPipeline: number;
  wonRevenue: number;
  averageTicket: number;
  openTasks: number;
  overdueTasks: number;
  leadSeries: { day: string; count: number }[];
  stageBreakdown: { stage: string; count: number; value: number }[];
  sourceBreakdown: { source: string; count: number }[];
  attendanceBreakdown: { state: string; count: number }[];
  channelBreakdown: { channel: string; count: number }[];
};

const empty: Data = {
  periodDays: 30, activeContacts: 0, leads: 0, openConversations: 0, conversion: 0,
  openPipeline: 0, wonRevenue: 0, averageTicket: 0, openTasks: 0, overdueTasks: 0,
  leadSeries: [], stageBreakdown: [], sourceBreakdown: [], attendanceBreakdown: [], channelBreakdown: []
};
const stageLabels: Record<string,string> = { new:'Novo', qualification:'Qualificação', proposal:'Proposta', closing:'Fechamento', won:'Ganho', lost:'Perdido' };
const attendanceLabels: Record<string,string> = { waiting:'Esperando', in_service:'Atendimento', automatic:'Automático' };
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function HorizontalBars({ rows, labelKey }: { rows: (Breakdown & Record<string, unknown>)[]; labelKey: string }) {
  const max = Math.max(1, ...rows.map(row => Number(row.count ?? 0)));
  return <div className="metric-bars">{rows.length === 0 ? <div className="empty compact-empty">Sem dados no período.</div> : rows.map((row, index) => {
    const raw = String(row[labelKey] ?? '—');
    const label = labelKey === 'stage' ? (stageLabels[raw] ?? raw) : labelKey === 'state' ? (attendanceLabels[raw] ?? raw) : raw;
    return <div className="metric-bar-row" key={`${raw}-${index}`}><div className="metric-bar-label"><span>{label}</span><b>{row.count}</b></div><div className="metric-bar-track"><i style={{ width: `${Math.max(4, (Number(row.count) / max) * 100)}%` }}/></div></div>;
  })}</div>;
}

export default function Dashboard() {
  const [data, setData] = useState<Data>(empty);
  const [period, setPeriod] = useState(30);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'pdf'|'excel'|''>('');

  async function load(days: number) {
    setLoading(true);
    try {
      const r = await fetch(`/api/dashboard?days=${days}`, { cache: 'no-store' });
      const d = await r.json();
      if (r.ok) setData(d.data ?? empty);
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(period); }, [period]);

  const maxLeads = useMemo(() => Math.max(1, ...data.leadSeries.map(item => item.count)), [data.leadSeries]);
  const stats = [
    ['Contatos ativos', String(data.activeContacts), Users, 'Base ativa'],
    ['Leads em aberto', String(data.leads), UserPlus, `Últimos ${data.periodDays} dias`],
    ['Atendimentos', String(data.openConversations), MessagesSquare, 'Conversas abertas'],
    ['Conversão', `${data.conversion.toLocaleString('pt-BR')}%`, TrendingUp, 'Ganhos x encerrados'],
    ['Pipeline', money(data.openPipeline), WalletCards, 'Valor em aberto'],
    ['Receita ganha', money(data.wonRevenue), CheckCircle2, 'Negócios ganhos'],
    ['Tarefas abertas', String(data.openTasks), ListTodo, 'Pendências comerciais'],
    ['Atrasadas', String(data.overdueTasks), AlertTriangle, 'Requer atenção']
  ] as const;

  async function exportExcel() {
    setExporting('excel');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const summary = [
        ['Indicador','Valor'], ['Período',`${data.periodDays} dias`], ['Contatos ativos',data.activeContacts], ['Leads',data.leads],
        ['Atendimentos abertos',data.openConversations], ['Conversão',`${data.conversion}%`], ['Pipeline',data.openPipeline],
        ['Receita ganha',data.wonRevenue], ['Ticket médio',data.averageTicket], ['Tarefas abertas',data.openTasks], ['Tarefas atrasadas',data.overdueTasks]
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Resumo');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.stageBreakdown.map(row => ({ Etapa: stageLabels[row.stage] ?? row.stage, Quantidade: row.count, Valor: row.value }))), 'Pipeline');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.sourceBreakdown.map(row => ({ Origem: row.source, Quantidade: row.count }))), 'Origens');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.attendanceBreakdown.map(row => ({ Fila: attendanceLabels[row.state] ?? row.state, Quantidade: row.count }))), 'Atendimento');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.leadSeries.map(row => ({ Data: row.day, Leads: row.count }))), 'Leads por dia');
      XLSX.writeFile(wb, `ecojoi-relatorio-${new Date().toISOString().slice(0,10)}.xlsx`);
    } finally { setExporting(''); }
  }

  async function exportPdf() {
    setExporting('pdf');
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Ecojoi CRM - Relatório Executivo', 16, 18);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`Período analisado: ${data.periodDays} dias`, 16, 25); doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 16, 31);
      let y = 43;
      const lines = [
        ['Contatos ativos', String(data.activeContacts)], ['Leads em aberto', String(data.leads)], ['Atendimentos abertos', String(data.openConversations)],
        ['Conversão', `${data.conversion}%`], ['Pipeline aberto', money(data.openPipeline)], ['Receita ganha', money(data.wonRevenue)],
        ['Ticket médio', money(data.averageTicket)], ['Tarefas abertas', String(data.openTasks)], ['Tarefas atrasadas', String(data.overdueTasks)]
      ];
      doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text('Resumo', 16, y); y += 7; doc.setFontSize(10);
      for (const [label,value] of lines) { doc.setFont('helvetica','normal'); doc.text(label, 16, y); doc.setFont('helvetica','bold'); doc.text(value, 94, y); y += 6; }
      y += 4; doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text('Pipeline por etapa', 16, y); y += 7; doc.setFontSize(9);
      for (const row of data.stageBreakdown) { doc.setFont('helvetica','normal'); doc.text(stageLabels[row.stage] ?? row.stage, 16, y); doc.text(`${row.count} oportunidade(s)`, 70, y); doc.text(money(row.value), 130, y); y += 5.5; }
      y += 4; doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text('Origens de contatos', 16, y); y += 7; doc.setFontSize(9);
      for (const row of data.sourceBreakdown) { doc.setFont('helvetica','normal'); doc.text(row.source, 16, y); doc.text(String(row.count), 100, y); y += 5.5; }
      doc.save(`ecojoi-relatorio-${new Date().toISOString().slice(0,10)}.pdf`);
    } finally { setExporting(''); }
  }

  return <div className={`content dashboard-page ${styles.root}`}>
    <div className="page-head dashboard-head">
      <div><h1 className="page-title">Visão geral</h1><p className="page-sub">Indicadores executivos, operação comercial e atendimento do seu tenant.</p></div>
      <div className="dashboard-actions">
        <select className="select dashboard-period" value={period} onChange={e => setPeriod(Number(e.target.value))}><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option></select>
        <button className="btn btn-secondary" onClick={exportPdf} disabled={loading || !!exporting}><FileText size={16}/>{exporting === 'pdf' ? 'Gerando...' : 'Exportar PDF'}</button>
        <button className="btn btn-primary" onClick={exportExcel} disabled={loading || !!exporting}><FileSpreadsheet size={16}/>{exporting === 'excel' ? 'Gerando...' : 'Exportar Excel'}</button>
      </div>
    </div>

    {loading ? <div className="card empty">Carregando indicadores...</div> : <>
      <div className="dashboard-kpis">{stats.map(([label,value,Icon,helper]) => <article className="card dashboard-kpi" key={label}><div className="dashboard-kpi-top"><span className="stat-icon"><Icon size={18}/></span><span className="dashboard-kpi-helper">{helper}</span></div><strong>{value}</strong><span>{label}</span></article>)}</div>

      <div className="dashboard-grid-main">
        <section className="card dashboard-panel dashboard-leads-panel"><div className="panel-title"><div><h3>Entrada de leads</h3><p>Novos leads no período selecionado.</p></div><span className="badge">{data.leadSeries.reduce((sum,row) => sum + row.count,0)} novos</span></div><div className="dashboard-bars">{data.leadSeries.map((row,index) => <div className="dashboard-bar-item" key={row.day} title={`${row.day}: ${row.count}`}><div className="dashboard-bar-value">{row.count || ''}</div><div className="dashboard-bar" style={{ height: `${Math.max(5,(row.count/maxLeads)*100)}%` }}/>{(data.periodDays <= 7 || index % Math.max(1,Math.floor(data.periodDays/10)) === 0) && <small>{new Date(`${row.day}T12:00:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</small>}</div>)}</div></section>
        <section className="card dashboard-panel"><div className="panel-title"><div><h3>Atendimento</h3><p>Distribuição atual das filas.</p></div><Clock3 size={18}/></div><HorizontalBars rows={data.attendanceBreakdown as (Breakdown & Record<string, unknown>)[]} labelKey="state"/><div className="dashboard-mini-list">{data.channelBreakdown.map(row => <div key={row.channel}><span>{row.channel}</span><b>{row.count}</b></div>)}</div></section>
      </div>

      <div className="dashboard-grid-bottom">
        <section className="card dashboard-panel"><div className="panel-title"><div><h3>Pipeline por etapa</h3><p>Quantidade atual de oportunidades.</p></div></div><HorizontalBars rows={data.stageBreakdown as (Breakdown & Record<string, unknown>)[]} labelKey="stage"/><div className="dashboard-finance"><div><span>Pipeline aberto</span><strong>{money(data.openPipeline)}</strong></div><div><span>Ticket médio ganho</span><strong>{money(data.averageTicket)}</strong></div></div></section>
        <section className="card dashboard-panel"><div className="panel-title"><div><h3>Origem dos contatos</h3><p>Canais que alimentam sua base.</p></div></div><HorizontalBars rows={data.sourceBreakdown as (Breakdown & Record<string, unknown>)[]} labelKey="source"/></section>
        <section className="card dashboard-panel dashboard-summary"><div className="panel-title"><div><h3>Prioridades</h3><p>Pontos que merecem atenção agora.</p></div></div><div className="summary-line"><span className="summary-icon warning"><AlertTriangle size={17}/></span><div><b>{data.overdueTasks} tarefa(s) atrasada(s)</b><span>Revisar atividades vencidas da equipe.</span></div></div><div className="summary-line"><span className="summary-icon"><MessagesSquare size={17}/></span><div><b>{data.openConversations} conversa(s) abertas</b><span>Acompanhar filas de atendimento.</span></div></div><div className="summary-line"><span className="summary-icon success-icon"><TrendingUp size={17}/></span><div><b>{data.conversion}% de conversão</b><span>Resultado de negócios encerrados.</span></div></div></section>
      </div>
    </>}
  </div>;
}
