import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/api/ai-agent/reply/route';

const tenantId = 'a3cbd731-4fb7-47d5-9039-a269a6161e02';
const conversationId = 'b139c412-330b-4ad7-8d88-5f7b0463f37b';
const { canSend, send, insert } = vi.hoisted(() => ({
  canSend: vi.fn(), send: vi.fn(), insert: vi.fn()
}));

vi.mock('../lib/server/whatsapp', () => ({
  canSendFreeformWhatsApp: canSend,
  sendWhatsAppText: send
}));
vi.mock('../lib/server/outbound-queue', () => ({ enqueueOutbound: vi.fn() }));
vi.mock('../lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        insert: (value: unknown) => { insert(value); return query; },
        update: () => query,
        single: async () => ({ data: { id: 'message' }, error: null }),
        maybeSingle: async () => ({
          data: {
            channel: 'whatsapp', attendance_state: 'automatic',
            last_inbound_at: null, contact: { phone: '+550000000000' }
          },
          error: null
        })
      };
      return query;
    }
  })
}));

function reply() {
  vi.stubEnv('N8N_WEBHOOK_TOKEN', 'test-token');
  return POST(new Request('https://crm.example/api/ai-agent/reply', {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body: JSON.stringify({ tenant_id: tenantId, conversation_id: conversationId, body: 'Teste' })
  }));
}

describe('resposta automática pelo provedor WhatsApp da empresa', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('respeita a janela de atendimento quando o provedor a exige', async () => {
    canSend.mockResolvedValue(false);
    expect((await reply()).status).toBe(409);
    expect(canSend).toHaveBeenCalledWith(tenantId, null);
    expect(insert).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('envia pelo provedor configurado quando a resposta é permitida', async () => {
    canSend.mockResolvedValue(true);
    send.mockResolvedValue({ delivered: true, providerMessageId: 'provider-message' });
    const response = await reply();
    expect(response.status).toBe(201);
    expect(send).toHaveBeenCalledWith(tenantId, '+550000000000', 'Teste');
    expect(await response.json()).toMatchObject({ delivery: 'sent' });
  });
});
