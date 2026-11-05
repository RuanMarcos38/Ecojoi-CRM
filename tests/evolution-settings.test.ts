import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/api/integrations/whatsapp/evolution/settings/route';

const { upsert, maybeSingle } = vi.hoisted(() => ({
  upsert: vi.fn().mockResolvedValue({ error: null }),
  maybeSingle: vi.fn()
}));
vi.mock('../lib/auth/context', () => ({
  requirePermission: async () => ({ tenantId: 'tenant', userId: 'user' })
}));
vi.mock('../lib/server/audit', () => ({ audit: vi.fn() }));
vi.mock('../lib/supabase/admin', () => ({
  createAdminClient: () => {
    const table = { select: () => table, eq: () => table, maybeSingle, upsert };
    return { from: () => table };
  }
}));

function save(api_url: string, api_key?: string) {
  return POST(new Request('https://crm.example/api/settings', {
    method: 'POST',
    body: JSON.stringify({ api_url, api_key })
  }));
}

describe('chaves da Evolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('não envia chave salva ou de ambiente a um endereço novo', async () => {
    vi.stubEnv('EVOLUTION_API_URL', 'https://shared.example');
    vi.stubEnv('EVOLUTION_API_KEY', 'environment-test-key');
    maybeSingle.mockResolvedValue({ data: { config: {
      api_url: 'https://previous.example', api_key: 'previous-test-key'
    } } });

    expect((await save('https://different.example')).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('preserva a chave salva quando o endereço permanece igual', async () => {
    maybeSingle.mockResolvedValue({ data: { config: {
      api_url: 'https://previous.example/', api_key: 'previous-test-key'
    } } });

    expect((await save('https://previous.example')).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({ api_key: 'previous-test-key' })
    }), expect.anything());
  });
});
