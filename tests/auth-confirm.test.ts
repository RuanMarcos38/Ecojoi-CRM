import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { GET } from '../app/auth/confirm/route';

vi.mock('../lib/supabase/server',()=>({
  createClient:async()=>({
    auth:{exchangeCodeForSession:async()=>({error:null})}
  })
}));

const origin='https://crm.ecojoi.com.br';

function confirm(next:string){
  const url=new URL('/auth/confirm',origin);
  url.searchParams.set('code','test-code');
  url.searchParams.set('next',next);
  return GET(new NextRequest(url));
}

describe('redirecionamento após confirmar a sessão',()=>{
  it('mantém um destino local válido',async()=>{
    const response=await confirm('/redefinir-senha');
    expect(response.headers.get('location')).toBe(origin+'/redefinir-senha');
  });

  it.each(['//outro.example','/\\outro.example','//[','https://outro.example'])(
    'usa a página local padrão para o destino inválido %s',
    async next=>{
      const response=await confirm(next);
      expect(response.headers.get('location')).toBe(origin+'/setup');
    }
  );
});
