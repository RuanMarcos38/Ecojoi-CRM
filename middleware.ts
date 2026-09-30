import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAnonKey, getSupabaseUrl } from './lib/supabase/env';

type CookieToSet={name:string;value:string;options:CookieOptions};

function usesOwnAuthentication(path:string){
  return path.startsWith('/api/public/')
    || path.startsWith('/api/v1/')
    || path==='/api/integrations/meta/webhook'
    || path==='/api/ai-agent/reply'
    || path==='/api/workers/tick'
    || path==='/api/health';
}

export async function middleware(request:NextRequest){
  let response=NextResponse.next({request});
  const url=getSupabaseUrl();
  const anon=getSupabaseAnonKey();
  if(!url||!anon)return response;

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

  const {data:{user}}=await supabase.auth.getUser();
  const isCrm=path.startsWith('/app');
  const isApi=path.startsWith('/api');
  const isSetup=path==='/setup';
  const isMfa=path==='/mfa';
  const isAuth=path==='/login'||path==='/register';

  if((isCrm||isApi||isSetup||isMfa)&&!user){
    if(isApi)return NextResponse.json({error:'unauthorized'},{status:401});
    const login=request.nextUrl.clone();login.pathname='/login';return NextResponse.redirect(login);
  }

  if(user){
    const [{data:profile},{data:factors},{data:aal}]=await Promise.all([
      supabase.from('profiles').select('id').eq('id',user.id).maybeSingle(),
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    ]);

    const hasVerifiedMfa=(factors?.totp??[]).some(f=>f.status==='verified')||(factors?.phone??[]).some(f=>f.status==='verified');
    const needsMfa=hasVerifiedMfa&&aal?.currentLevel!=='aal2';

    if(needsMfa&&(isCrm||isApi)){
      if(isApi)return NextResponse.json({error:'mfa_required'},{status:403});
      const target=request.nextUrl.clone();target.pathname='/mfa';return NextResponse.redirect(target);
    }

    if(isMfa&&!needsMfa){
      const target=request.nextUrl.clone();target.pathname=profile?'/app':'/setup';return NextResponse.redirect(target);
    }

    if(isCrm&&!profile){const setup=request.nextUrl.clone();setup.pathname='/setup';return NextResponse.redirect(setup);}
    if(isSetup&&profile){const app=request.nextUrl.clone();app.pathname='/app';return NextResponse.redirect(app);}
    if(isAuth){
      const target=request.nextUrl.clone();
      target.pathname=needsMfa?'/mfa':profile?'/app':'/setup';
      return NextResponse.redirect(target);
    }
  }

  return response;
}

export const config={matcher:['/app/:path*','/api/:path*','/login','/register','/setup','/mfa']};
