import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAnonKey, getSupabaseUrl } from './lib/supabase/env';

type CookieToSet={name:string;value:string;options:CookieOptions};

function usesOwnAuthentication(path:string){
  return path.startsWith('/api/public/')
    || (path.startsWith('/api/v1/') && path!=='/api/v1/openapi')
    || path==='/api/integrations/meta/webhook'
    || path==='/api/integrations/evolution/webhook'
    || path==='/api/ai-agent/reply'
    || path==='/api/workers/tick'
    || path==='/api/health';
}

export async function middleware(request:NextRequest){
  let response=NextResponse.next({request});
  const url=getSupabaseUrl();
  const anon=getSupabaseAnonKey();
  if(!url||!anon){
    return NextResponse.json({error:'service_unavailable',message:'O CRM está temporariamente indisponível. A configuração de conexão precisa ser revisada.'},{status:503,headers:{'cache-control':'no-store'}});
  }

  const supabase=createServerClient(url,anon,{
    cookies:{
      getAll(){return request.cookies.getAll();},
      setAll(cookiesToSet:CookieToSet[]){
        cookiesToSet.forEach(({name,value})=>request.cookies.set(name,value));
        response=NextResponse.next({request});
        cookiesToSet.forEach(({name,value,options})=>response.cookies.set(name,value,options));
      }
    }
  });

  const path=request.nextUrl.pathname;
  if(usesOwnAuthentication(path))return response;

  function redirectTo(pathname:string){
    const target=request.nextUrl.clone();
    const [route,query]=pathname.split('?');
    target.pathname=route;
    target.search=query?'?'+query:'';
    const redirect=NextResponse.redirect(target);
    response.cookies.getAll().forEach(cookie=>redirect.cookies.set(cookie));
    return redirect;
  }

  const {data:{user}}=await supabase.auth.getUser();
  const isCrm=path.startsWith('/app');
  const isApi=path.startsWith('/api');
  const isSetup=path==='/setup';
  const isMfa=path==='/mfa';
  const isAuth=path==='/login'||path==='/register';

  if((isCrm||isApi||isSetup||isMfa)&&!user){
    if(isApi)return NextResponse.json({error:'unauthorized'},{status:401});
    return redirectTo('/login');
  }

  if(user){
    // Valida no servidor antes de acessar paginas ou APIs protegidas.
    // A sessao mais recente prevalece, sem depender do refresh do JWT.
    const {data:latestSession,error:sessionError}=await supabase.rpc('is_latest_crm_session');
    if(sessionError){
      console.error('[CRM] Falha ao validar sessao ativa.',sessionError.code);
      return NextResponse.json({error:'session_validation_unavailable'},{status:503,headers:{'cache-control':'no-store'}});
    }
    if(latestSession!==true){
      if(isApi)return NextResponse.json({error:'session_replaced'},{status:401,headers:{'cache-control':'no-store'}});
      if(isAuth)return response; // Nao redirecionar de volta ao CRM em loop.
      return redirectTo('/login?session=expired');
    }

    const [{data:profile,error:profileError},{data:factors,error:factorError},{data:aal,error:aalError}]=await Promise.all([
      supabase.from('profiles').select('id').eq('id',user.id).maybeSingle(),
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    ]);

    if(factorError||aalError||!factors||!aal){
      return NextResponse.json({error:'mfa_verification_unavailable'},{status:503,headers:{'cache-control':'no-store'}});
    }

    const hasVerifiedMfa=(factors?.totp??[]).some(f=>f.status==='verified')||(factors?.phone??[]).some(f=>f.status==='verified');
    const needsMfa=hasVerifiedMfa&&aal?.currentLevel!=='aal2';

    if(needsMfa&&(isCrm||isApi)){
      if(isApi)return NextResponse.json({error:'mfa_required'},{status:403});
      return redirectTo('/mfa');
    }

    if(profileError&&(isCrm||isSetup||isAuth||isMfa)){
      console.error('[CRM] Falha ao consultar o perfil para navegação.',profileError.code);
      return new NextResponse('Não foi possível verificar o vínculo com sua empresa. Tente novamente em instantes.',{
        status:503,headers:{'cache-control':'no-store','content-type':'text/plain; charset=utf-8'}
      });
    }

    if(isMfa&&!needsMfa)return redirectTo(profile?'/app':'/setup');
    if(isCrm&&!profile)return redirectTo('/setup');
    if(isSetup&&profile)return redirectTo('/app');
    if(isAuth)return redirectTo(needsMfa?'/mfa':profile?'/app':'/setup');
  }

  return response;
}

export const config={matcher:['/app/:path*','/api/:path*','/login','/register','/setup','/mfa']};
