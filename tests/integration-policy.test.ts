import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { integrationError, retryDelayMs, webhookEnvelope, webhookHeaders } from '@/lib/server/integration-policy';
import { canChangeAttendance,canSendHumanMessage } from '@/lib/crm/concurrency';
describe('contrato e recuperação das integrações', () => {
  it('usa backoff limitado', () => expect([1,2,3,4,99].map(retryDelayMs)).toEqual([30000,120000,300000,900000,900000]));
  it('não persiste segredos do erro', () => expect(integrationError(new Error('Bearer secret password=123 https://example.com?token=secret'))).toBe('integration_request_failed'));
  it('identifica timeout', () => { const error = new Error(); error.name = 'TimeoutError'; expect(integrationError(error)).toBe('integration_timeout'); });
  it('mantém id estável em retry e assina timestamp', () => {
    const item = { id: 'event-1', event_type: 'lead.created', entity_id: 'contact-1', payload: { id: 'contact-1' }, created_at: '2026-10-03T00:00:00Z' };
    const body = JSON.stringify(webhookEnvelope(item, 'now'));
    const headers = webhookHeaders(body, 'test-only', item.id, item.event_type, '123');
    expect(headers['idempotency-key']).toBe('event-1');
    expect(headers['x-ecojoi-signature-v2']).toBe('sha256=' + createHmac('sha256', 'test-only').update('123.' + body).digest('hex'));
    expect(webhookEnvelope(item, 'later').event_id).toBe('event-1');
  });
});
describe('controle de atendimento concorrente', () => {
  it('somente o responsável ativo envia texto, mídia ou template',()=>{
    const input={userId:'a',assignedTo:'a',state:'in_service',status:'open'};
    expect(canSendHumanMessage(input)).toBe(true);
    expect(canSendHumanMessage({...input,assignedTo:'b'})).toBe(false);
    expect(canSendHumanMessage({...input,state:'automatic'})).toBe(false);
    expect(canSendHumanMessage({...input,status:'closed'})).toBe(false);
  });
  const base = { role: 'user', userId: 'a', assignedTo: 'b', state: 'in_service', status: 'open' };
  it('impede usuário de assumir conversa já atribuída', () => expect(canChangeAttendance(base)).toBe(false));
  it('permite dono e supervisor', () => {
    expect(canChangeAttendance({ ...base, userId: 'b' })).toBe(true);
    expect(canChangeAttendance({ ...base, role: 'manager' })).toBe(true);
  });
  it('não reabre conversa fechada implicitamente', () => expect(canChangeAttendance({ ...base, role: 'company_admin', status: 'closed' })).toBe(false));
});

