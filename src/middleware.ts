import { NextResponse, type NextRequest } from 'next/server';

import { brand } from '@/lib/brand';

/* ============================================================================
   MIDDLEWARE
   ----------------------------------------------------------------------------
   Two jobs, in this order:

   1. REFERRAL CAPTURE. A visitor arriving on `/?r=code` gets the code written to
      a first-party cookie and is redirected to the same URL without the
      parameter. Doing it here rather than in a page component means the code
      survives the whole visit — including a bounce to the landing page, a read of
      the terms, and a signup ten minutes later — and the shared link never
      appears in the address bar with an attribution parameter attached.

   2. THE ADMIN PERIMETER. Middleware runs on the EDGE runtime and cannot verify
      the Supabase session (that needs a server-side round-trip). Everything it
      decides is based on the PRESENCE and SHAPE of cookies, both of which a
      caller controls.

      It is therefore a ROUTER, not a gate:
        • no auth cookie       → /admin/login, saving an anonymous visitor a
                                 rendered shell and a wasted round-trip
        • auth cookie present  → through to the page, where `requirePermission`
                                 verifies the session with supabase.auth.getUser()
                                 and reads the role from public.staff

      THE COOKIE PRESENCE IS NOT A CREDENTIAL. Forging one buys exactly one thing:
      the privilege of being refused half a millisecond later by
      `src/lib/admin/guard.ts`. Treat this file as UX, and the guard plus RLS as
      security.
   ========================================================================== */

const REFERRAL_COOKIE = `${brand.slug}-ref`;

/** Reachable without a staff session: the login screen and the refusal surface.
    Redirecting the 403 page to the 403 page is a loop. */
const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/403'];

const REFERRAL_TTL_DAYS = 30;

export function middleware(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;

  /* ---- REFERRAL CAPTURE -------------------------------------------------- */
  const code = searchParams.get('r') ?? searchParams.get('ref');
  if (code && /^[a-zA-Z0-9_-]{4,32}$/.test(code)) {
    const url = request.nextUrl.clone();
    url.searchParams.delete('r');
    url.searchParams.delete('ref');

    const response = NextResponse.redirect(url);
    response.cookies.set(REFERRAL_COOKIE, code, {
      httpOnly: false, // the register form reads it to prefill the field
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: REFERRAL_TTL_DAYS * 24 * 60 * 60,
    });
    return response;
  }

  if (!pathname.startsWith('/admin')) return NextResponse.next();

  /* ---- ADMIN PERIMETER --------------------------------------------------- */
  if (PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  /* Native auth uses one opaque, httpOnly session cookie. This is only a
     presence check — the page behind middleware verifies it against PostgreSQL. */
  const hasSession = Boolean(request.cookies.get('vazionix_session')?.value);

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    /* `next` is carried so a deep link survives the round-trip. It is validated
       as a same-origin admin path on the login side; an open redirect on a login
       page is a phishing primitive. */
    url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  /* Looks signed in. The page verifies for real. `x-admin-route` is a
     convenience for logging, never for authorisation; an incoming copy is
     overwritten so a caller cannot inject one. */
  const headers = new Headers(request.headers);
  headers.set('x-admin-route', pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  /* Everything except static assets, the image optimiser, any path with a file
     extension, and the PROVIDER CALLBACK ROUTES.

     WHY THE CALLBACKS ARE EXCLUDED
     `/api/adslab/*` and `/api/captcha/*` are called by AdsLab's servers, not by a
     browser. They authenticate with a signature, not a session, and they must not
     pass through referral capture, the admin perimeter, or anything else that
     could redirect or rewrite them. A 3xx on a postback is a lost conversion, and
     AdsLab retries a non-200 indefinitely.

     The extension exclusion matters for more than performance: ad networks and
     search engines verify ownership by fetching a file like
     `/6a9922b254e3a41fe63104ef.html` from `public/`. Those requests must reach the
     static handler without a middleware invocation deciding anything about them. */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/adslab|api/captcha|api/tasks|.*\\.[a-zA-Z0-9]+$).*)',
  ],
};
