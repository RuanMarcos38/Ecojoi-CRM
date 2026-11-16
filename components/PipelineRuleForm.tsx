'use client';

import type { FormEventHandler } from 'react';

export function pipelineRulePayload(form: HTMLFormElement) {
  const fields = new FormData(form);
  const units: Record<string, number> = { minutes: 1, hours: 60, days: 1440 };
  const multiplier = units[String(fields.get('wait_unit'))] ?? 1440;
  return {
    name: fields.get('name'),
    stage: fields.get('stage'),
    channel: fields.get('channel'),
    wait_minutes: Number(fields.get('wait_value')) * multiplier,
    message_template: fields.get('message_template'),
    enabled: true
  };
}

export default function PipelineRuleForm({ stages, onSubmit, saving }: {
  stages: ReadonlyArray<readonly [string, string]>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  saving?: boolean;
}) {
  return <form className="automation-rule-form" onSubmit={onSubmit}>
          <div className="form-grid pipeline-form-grid">
            <div className="field"><label>Nome da automação</label><input className="input" name="name" required placeholder="Follow-up da proposta"/></div>
            <div className="field"><label>Etapa</label><select className="select" name="stage">{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="field"><label>Esperar</label><div className="time-rule"><input className="input" name="wait_value" type="number" min="1" defaultValue="2" required/><select className="select" name="wait_unit" defaultValue="days"><option value="minutes">Minutos</option><option value="hours">Horas</option><option value="days">Dias</option></select></div></div>
            <div className="field"><label>Canal</label><select className="select" name="channel" defaultValue="internal"><option value="internal">Interno</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option></select></div>
          </div>
          <div className="field"><label>Mensagem</label><textarea className="textarea" name="message_template" rows={3} required defaultValue="Olá {{nome}}, passando para acompanhar a oportunidade {{oportunidade}}. Posso te ajudar com alguma informação?"/></div>
          <div className="template-help">Variáveis disponíveis: <code>{'{{nome}}'}</code> <code>{'{{oportunidade}}'}</code> <code>{'{{etapa}}'}</code></div>
          <button className="btn btn-primary" disabled={saving}>Salvar automação</button>
        </form>;
}
