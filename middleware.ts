import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const { data: { user } } = await supabase.auth.getUser();
  const path=request.nextUrl.pathname;
  const isCrm=path.startsWith('/app');
  const isApi=path.startsWith('/api');
  const isSetup=path==='/setup';
  const isAuth=path==='/login'||path==='/register';

  if ((isCrm || isApi || isSetup) && !user) {
    if (isApi) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const login = request.nextUrl.clone(); login.pathname = '/login'; return NextResponse.redirect(login);
  }

  if(user){
    const {data:profile}=await supabase.from('profiles').select('id').eq('id',user.id).maybeSingle();
    if(isCrm&&!profile){const setup=request.nextUrl.clone();setup.pathname='/setup';return NextResponse.redirect(setup)}
    if(isSetup&&profile){const app=request.nextUrl.clone();app.pathname='/app';return NextResponse.redirect(app)}
    if(isAuth){const target=request.nextUrl.clone();target.pathname=profile?'/app':'/setup';return NextResponse.redirect(target)}
  }
  return response;
}

export const config = { matcher: ['/app/:path*', '/api/:path*', '/login', '/register', '/setup'] };
