import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendWhatsAppText } from '@/lib/server/meta';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { meta_phone_number_id: '123' } })
        })
      })
    })
  })
}));
vi.mock('@/lib/server/lead-ingestion', () => ({ ingestLead: vi.fn() }));
vi.mock('@/lib/server/ai-agent', () => ({ notifyAiAgentMessage: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Meta WhatsApp quoted reply', () => {
  it('adds context only when replying to a message', async () => {
    vi.stubEnv('META_GRAPH_ACCESS_TOKEN', 'test-token');
    const request = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ messages: [{ id: 'wamid.sent' }] })
    );
    vi.stubGlobal('fetch', request);

    await sendWhatsAppText('tenant', '+5547999999999', 'Segue o orçamento', 'wamid.original');
    await sendWhatsAppText('tenant', '+5547999999999', 'Olá');

    expect(JSON.parse(String(request.mock.calls[0][1].body))).toMatchObject({
      context: { message_id: 'wamid.original' },
      type: 'text',
      text: { body: 'Segue o orçamento' }
    });
    expect(JSON.parse(String(request.mock.calls[1][1].body))).not.toHaveProperty('context');
  });
});
