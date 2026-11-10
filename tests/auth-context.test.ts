import { describe, expect, it, vi } from 'vitest';
import { getRequestContext } from '../lib/auth/context';

const { auth, from, rpc } = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
    mfa: { listFactors: vi.fn(), getAuthenticatorAssuranceLevel: vi.fn() }
  },
  from: vi.fn(),
  rpc: vi.fn()
}));

vi.mock('../lib/supabase/server', () => ({ createClient: async () => ({ auth, from, rpc }) }));

describe('MFA na autorização de rotas', () => {
  it.each(['listFactors', 'getAuthenticatorAssuranceLevel'] as const)(
    'bloqueia o acesso se %s estiver indisponível',
    async method => {
      from.mockClear();
      rpc.mockReset().mockResolvedValue({data:true,error:null});
      auth.getUser.mockResolvedValue({ data: { user: { id: 'user' } } });
      auth.mfa.listFactors.mockResolvedValue({ data: { totp: [], phone: [] } });
      auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1' } });
      auth.mfa[method].mockResolvedValue({ data: null, error: new Error('Auth unavailable') });

      await expect(getRequestContext()).rejects.toMatchObject({ status: 503 });
      expect(from).not.toHaveBeenCalled();
    }
  );
});


describe('Protecao de sessao unica', () => {
  it('rejeita sessao substituida antes de consultar dados ou permissoes', async () => {
    from.mockClear();
    auth.getUser.mockResolvedValue({data:{user:{id:'user'}},error:null});
    rpc.mockResolvedValue({data:false,error:null});
    await expect(getRequestContext()).rejects.toMatchObject({status:401});
    expect(from).not.toHaveBeenCalled();
  });
  it('falha de forma segura quando a validacao de sessao esta indisponivel', async () => {
    from.mockClear();
    auth.getUser.mockResolvedValue({data:{user:{id:'user'}},error:null});
    rpc.mockResolvedValue({data:null,error:new Error('Database unavailable')});
    await expect(getRequestContext()).rejects.toMatchObject({status:503});
    expect(from).not.toHaveBeenCalled();
  });
});
