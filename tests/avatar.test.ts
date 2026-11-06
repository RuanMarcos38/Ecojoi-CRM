import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../app/api/me/avatar/route';

const self = 'a3cbd731-4fb7-47d5-9039-a269a6161e02';
const colleague = 'b139c412-330b-4ad7-8d88-5f7b0463f37b';
const { upload, download, getContext } = vi.hoisted(() => ({
  upload: vi.fn(), download: vi.fn(), getContext: vi.fn()
}));

vi.mock('../lib/auth/context', () => ({ getRequestContext: getContext }));
vi.mock('../lib/supabase/admin', () => ({
  createAdminClient: () => ({ storage: { from: () => ({ upload, download }) } })
}));

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);

function submit(file: File) {
  const body = new FormData();
  body.set('avatar', file);
  body.set('userId', colleague);
  return POST(new Request('https://crm.example/api/me/avatar', { method: 'POST', body }));
}

describe('fotos de perfil', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getContext.mockResolvedValue({ tenantId: 'tenant', userId: self, role: 'user' });
  });

  it('grava somente na conta autenticada, mesmo com outro usuário no formulário', async () => {
    upload.mockResolvedValue({ error: null });
    expect((await submit(new File([png], 'foto.png', { type: 'image/png' }))).status).toBe(200);
    expect(upload).toHaveBeenCalledWith(`_profile-avatars/tenant/${self}`, expect.any(Buffer),
      { upsert: true, contentType: 'image/png' });
  });

  it('rejeita conteúdo disfarçado de imagem', async () => {
    expect((await submit(new File(['<script>test</script>'], 'foto.png', { type: 'image/png' }))).status).toBe(415);
    expect(upload).not.toHaveBeenCalled();
  });

  it('consulta a foto do atendente somente no diretório da empresa autenticada', async () => {
    download.mockResolvedValue({ data: new Blob([png]), error: null });
    const response = await GET(new Request(`https://crm.example/api/me/avatar?userId=${colleague}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(download).toHaveBeenCalledWith(`_profile-avatars/tenant/${colleague}`);
  });

  it('impede acesso sem sessão antes de consultar o armazenamento', async () => {
    getContext.mockRejectedValue(new Response(null, { status: 401 }));
    expect((await GET(new Request('https://crm.example/api/me/avatar'))).status).toBe(401);
    expect(download).not.toHaveBeenCalled();
  });
});
