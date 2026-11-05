import { describe, expect, it, vi } from 'vitest';
import { getRequestContext } from '../lib/auth/context';

const { auth, from } = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
    mfa: { listFactors: vi.fn(), getAuthenticatorAssuranceLevel: vi.fn() }
  },
  from: vi.fn()
}));

vi.mock('../lib/supabase/server', () => ({ createClient: async () => ({ auth, from }) }));

describe('MFA na autorização de rotas', () => {
  it.each(['listFactors', 'getAuthenticatorAssuranceLevel'] as const)(
    'bloqueia o acesso se %s estiver indisponível',
    async method => {
      from.mockClear();
      auth.getUser.mockResolvedValue({ data: { user: { id: 'user' } } });
      auth.mfa.listFactors.mockResolvedValue({ data: { totp: [], phone: [] } });
      auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1' } });
      auth.mfa[method].mockResolvedValue({ data: null, error: new Error('Auth unavailable') });

      await expect(getRequestContext()).rejects.toMatchObject({ status: 503 });
      expect(from).not.toHaveBeenCalled();
    }
  );
});
