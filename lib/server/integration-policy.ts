import { createHmac } from 'node:crypto';

export function retryDelayMs(attempt: number) {
  const delays = [30_000, 120_000, 300_000, 900_000];
  return delays[Math.min(delays.length - 1, Math.max(0, attempt - 1))];
}

// Only stable, non-sensitive codes are persisted. Provider response bodies are never logged.
export function integrationError(error: unknown) {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'integration_timeout';
  return 'integration_request_failed';
}

export function webhookEnvelope(item: { id: string; event_type: string; entity_id: string | null; payload: unknown; created_at: string }, occurredAt: string) {
  return {
    event_id: item.id, event_type: item.event_type, occurred_at: item.created_at,
    source: 'ecojoi-crm', entity_id: item.entity_id, schema_version: '1.0', data: item.payload,
    // Preserve the existing v1 consumer fields during transition.
    event: item.event_type, payload: item.payload, delivered_at: occurredAt
  };
}

export function webhookHeaders(body: string, key: string, deliveryId: string, event: string, timestamp: string) {
  return {
    'content-type': 'application/json', 'user-agent': 'Ecojoi-CRM-Webhooks/1.0',
    'x-ecojoi-event': event, 'x-ecojoi-delivery': deliveryId,
    'idempotency-key': deliveryId, 'x-ecojoi-timestamp': timestamp,
    'x-ecojoi-signature': 'sha256=' + createHmac('sha256', key).update(body).digest('hex'),
    'x-ecojoi-signature-v2': 'sha256=' + createHmac('sha256', key).update(timestamp + '.' + body).digest('hex')
  };
}

