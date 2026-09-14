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
  const isCrm = request.nextUrl.pathname.startsWith('/app');
  const isApi = request.nextUrl.pathname.startsWith('/api');
  const isLogin = request.nextUrl.pathname === '/login';

  if ((isCrm || isApi) && !user) {
    if (isApi) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    return NextResponse.redirect(login);
  }

  if (isLogin && user) {
    const app = request.nextUrl.clone();
    app.pathname = '/app';
    return NextResponse.redirect(app);
  }

  return response;
}

export const config = { matcher: ['/app/:path*', '/api/:path*', '/login'] };
