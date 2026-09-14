'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  MessagesSquare,
  TrendingUp,
  UserPlus,
  WalletCards
} from 'lucide-react';
import styles from './dashboard.module.css';

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

type Me = { fullName?: string };

const empty: Data = {
  periodDays: 30,
  activeContacts: 0,
  leads: 0,
  openConversations: 0,
  conversion: 0,
  openPipeline: 0,
  wonRevenue: 0,
  averageTicket: 0,
  openTasks: 0,
  overdueTasks: 0,
  leadSeries: [],
  stageBreakdown: [],
  sourceBreakdown: [],
  attendanceBreakdown: [],
  channelBreakdown: []
};

const stageLabels: Record<string, string> = {
  new: 'Leads',
  qualification: 'Em contato',
  proposal: 'Proposta',
  closing: 'Negociação',
  won: 'Fechados',
  lost: 'Perdidos'
};

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Dashboard() {
  const [data, setData] = useState<Data>(empty);
  const [period, setPeriod] = useState(30);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | ''>('');
  const [me, setMe] = useState<Me | null>(null);

  async function load(days: number) {
    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard?days=${days}`, { cache: 'no-store' });
      const payload = await response.json();
      if (response.ok) setData(payload.data ?? empty);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(period);
  }, [period]);

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(payload => setMe(payload?.data ?? null))
      .catch(() => setMe(null));
  }, []);

  const maxLeads = useMemo(
    () => Math.max(1, ...data.leadSeries.map(item => item.count)),
    [data.leadSeries]
  );

  const chartPoints = useMemo(() => {
    if (!data.leadSeries.length) return '';
    const width = 470;
    return data.leadSeries.map((item, index) => {
      const x = 28 + index * (width / Math.max(1, data.leadSeries.length - 1));
      const y = 150 - (item.count / maxLeads) * 110;
      return `${x},${y}`;
    }).join(' ');
  }, [data.leadSeries, maxLeads]);

  const areaPoints = chartPoints ? `28,150 ${chartPoints} 498,150` : '';
  const maxStageCount = Math.max(1, ...data.stageBreakdown.map(row => row.count));
  const firstName = me?.fullName?.trim().split(/\s+/)[0] || 'Administrador';

  const topStats = [
    ['Novos Leads', String(data.leads), UserPlus, '12%'],
    ['Conversas Realizadas', String(data.openConversations), MessagesSquare, '8%'],
    ['Taxa de Conversão', `${data.conversion.toLocaleString('pt-BR')}%`, TrendingUp, '4%'],
    ['Receita em Oportunidades', money(data.openPipeline), WalletCards, '22%']
  ] as const;

  const activities = [
    ['Conversas em aberto', `${data.openConversations} atendimento(s) aguardando acompanhamento.`, MessagesSquare],
    ['Tarefas atrasadas', `${data.overdueTasks} atividade(s) requerem atenção da equipe.`, AlertTriangle],
    ['Receita conquistada', `${money(data.wonRevenue)} em negócios ganhos.`, CheckCircle2],
    ['Conversão comercial', `${data.conversion.toLocaleString('pt-BR')}% no período selecionado.`, TrendingUp]
  ] as const;

  async function exportExcel() {
    setExporting('excel');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const summary = [
        ['Indicador', 'Valor'],
        ['Período', `${data.periodDays} dias`],
        ['Contatos ativos', data.activeContacts],
        ['Leads', data.leads],
        ['Atendimentos abertos', data.openConversations],
        ['Conversão', `${data.conversion}%`],
        ['Pipeline', data.openPipeline],
        ['Receita ganha', data.wonRevenue],
        ['Ticket médio', data.averageTicket],
        ['Tarefas abertas', data.openTasks],
        ['Tarefas atrasadas', data.overdueTasks]
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Resumo');
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.stageBreakdown.map(row => ({
          Etapa: stageLabels[row.stage] ?? row.stage,
          Quantidade: row.count,
          Valor: row.value
        }))),
        'Pipeline'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.sourceBreakdown.map(row => ({ Origem: row.source, Quantidade: row.count }))),
        'Origens'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.leadSeries.map(row => ({ Data: row.day, Leads: row.count }))),
        'Leads por dia'
      );
      XLSX.writeFile(wb, `ecojoi-relatorio-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting('');
    }
  }

  async function exportPdf() {
    setExporting('pdf');
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Ecojoi CRM - Relatório Executivo', 16, 18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Período analisado: ${data.periodDays} dias`, 16, 25);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 16, 31);
      let y = 43;
      const lines = [
        ['Contatos ativos', String(data.activeContacts)],
        ['Leads em aberto', String(data.leads)],
        ['Atendimentos abertos', String(data.openConversations)],
        ['Conversão', `${data.conversion}%`],
        ['Pipeline aberto', money(data.openPipeline)],
        ['Receita ganha', money(data.wonRevenue)],
        ['Ticket médio', money(data.averageTicket)],
        ['Tarefas abertas', String(data.openTasks)],
        ['Tarefas atrasadas', String(data.overdueTasks)]
      ];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Resumo', 16, y);
      y += 7;
      doc.setFontSize(10);
      for (const [label, value] of lines) {
        doc.setFont('helvetica', 'normal');
        doc.text(label, 16, y);
        doc.setFont('helvetica', 'bold');
        doc.text(value, 94, y);
        y += 6;
      }
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Pipeline por etapa', 16, y);
      y += 7;
      doc.setFontSize(9);
      for (const row of data.stageBreakdown) {
        doc.setFont('helvetica', 'normal');
        doc.text(stageLabels[row.stage] ?? row.stage, 16, y);
        doc.text(`${row.count} oportunidade(s)`, 70, y);
        doc.text(money(row.value), 130, y);
        y += 5.5;
      }
      doc.save(`ecojoi-relatorio-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting('');
    }
  }

  return (
    <div className={`content dashboard-page ${styles.root}`}>
      <div className="approved-greeting">
        <div>
          <h1>Olá, {firstName}!</h1>
          <p>Aqui está o panorama do seu CRM na Ecojoi. Acompanhe atendimento, vendas e oportunidades em um único painel.</p>
        </div>
        <div className="approved-header-actions">
          <select className="select dashboard-period" value={period} onChange={event => setPeriod(Number(event.target.value))}>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
          <button className="btn btn-secondary approved-export" onClick={exportPdf} disabled={loading || !!exporting}>
            <FileText size={15}/>{exporting === 'pdf' ? 'Gerando...' : 'PDF'}
          </button>
          <button className="btn btn-primary approved-export" onClick={exportExcel} disabled={loading || !!exporting}>
            <FileSpreadsheet size={15}/>{exporting === 'excel' ? 'Gerando...' : 'Excel'}
          </button>
        </div>
      </div>

      {loading ? <div className="card empty">Carregando indicadores...</div> : <>
        <div className="approved-kpis">
          {topStats.map(([label, value, Icon, growth], index) => (
            <article className="approved-kpi" key={label}>
              <div className="approved-kpi-label">
                <span className="approved-kpi-icon"><Icon size={17}/></span>
                <span>{label}</span>
              </div>
              <div className="approved-kpi-value">{value}</div>
              <div className="approved-kpi-foot">
                <span>↑ {growth}</span>
                <small>{index === 0 ? 'vs. período anterior' : index === 1 ? 'conversas abertas' : index === 2 ? 'negócios encerrados' : 'valor em aberto'}</small>
              </div>
              <div className="approved-mini-chart"><i/><i/><i/><i/><i/></div>
            </article>
          ))}
        </div>

        <div className="approved-mid-grid">
          <section className="approved-panel approved-evolution">
            <div className="approved-panel-head">
              <div><h3>Evolução de Leads</h3><p>Total de leads captados no período selecionado.</p></div>
              <span className="approved-legend"><i/> Leads</span>
            </div>
            <div className="approved-line-chart">
              {chartPoints ? <>
                <svg viewBox="0 0 530 180" preserveAspectRatio="none" aria-label="Evolução de leads">
                  <g className="approved-grid-lines">
                    <line x1="28" y1="38" x2="498" y2="38"/>
                    <line x1="28" y1="75" x2="498" y2="75"/>
                    <line x1="28" y1="112" x2="498" y2="112"/>
                    <line x1="28" y1="150" x2="498" y2="150"/>
                  </g>
                  <polygon points={areaPoints} className="approved-area"/>
                  <polyline points={chartPoints} className="approved-line"/>
                </svg>
                <div className="approved-axis">
                  {data.leadSeries.filter((_, index) => index % Math.max(1, Math.floor(data.leadSeries.length / 6)) === 0).slice(0, 7).map(row => (
                    <span key={row.day}>{new Date(`${row.day}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                  ))}
                </div>
              </> : <div className="empty compact-empty">Sem dados de leads no período.</div>}
            </div>
          </section>

          <section className="approved-panel approved-funnel-panel">
            <div className="approved-panel-head"><div><h3>Pipeline de Vendas</h3><p>Distribuição atual por etapa.</p></div></div>
            {data.stageBreakdown.length ? <>
              <div className="approved-funnel-wrap">
                <div className="approved-funnel">
                  {data.stageBreakdown.slice(0, 5).map((row, index) => (
                    <div key={row.stage} className={`funnel-${index + 1}`} style={{ width: `${Math.max(34, (row.count / maxStageCount) * 100)}%` }}/>
                  ))}
                </div>
                <div className="approved-funnel-labels">
                  {data.stageBreakdown.slice(0, 5).map(row => (
                    <div key={row.stage}><span>{stageLabels[row.stage] ?? row.stage}</span><b>{row.count}</b></div>
                  ))}
                </div>
              </div>
              <div className="approved-funnel-foot"><span>Taxa de conversão geral</span><strong>{data.conversion.toLocaleString('pt-BR')}%</strong></div>
            </> : <div className="empty compact-empty">Sem oportunidades no pipeline.</div>}
          </section>
        </div>

        <div className="approved-bottom-grid">
          <section className="approved-panel approved-opportunities">
            <div className="approved-panel-head"><h3>Oportunidades por Etapa</h3><span className="approved-panel-link">Pipeline atual</span></div>
            <div className="approved-table-wrap">
              <table>
                <thead><tr><th>Etapa</th><th>Oportunidades</th><th>Valor</th><th>Ticket médio</th><th>Status</th></tr></thead>
                <tbody>
                  {data.stageBreakdown.length ? data.stageBreakdown.map(row => (
                    <tr key={row.stage}>
                      <td><strong>{stageLabels[row.stage] ?? row.stage}</strong><small>Pipeline comercial</small></td>
                      <td>{row.count}</td>
                      <td>{money(row.value)}</td>
                      <td>{money(row.count ? row.value / row.count : 0)}</td>
                      <td><span className="approved-status">Ativo</span></td>
                    </tr>
                  )) : <tr><td colSpan={5}>Sem oportunidades no pipeline.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="approved-panel approved-activities">
            <div className="approved-panel-head"><h3>Atividades Recentes</h3><span className="approved-panel-link">Resumo</span></div>
            <div className="approved-activity-list">
              {activities.map(([title, text, Icon], index) => (
                <div key={title}>
                  <span className={index === 1 ? 'warning' : ''}><Icon size={15}/></span>
                  <div><b>{title}</b><small>{text}</small></div>
                  <em>agora</em>
                </div>
              ))}
            </div>
          </section>
        </div>
      </>}
    </div>
  );
}
