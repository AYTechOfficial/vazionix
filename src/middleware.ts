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

   2. THE ADMIN PERIMETER. Middleware runs on the EDGE runtime, where
      `firebase-admin` cannot run: it needs Node crypto, a long-lived JWKS cache
      and a filesystem. So this file CANNOT verify a Firebase session cookie.
      Everything it decides is based on the presence and shape of cookies, both of
      which a caller controls.

      It is therefore a ROUTER, not a gate:
        • no session cookie      → /admin/login, saving an anonymous visitor a
                                   rendered shell and a wasted round-trip
        • session, no role hint  → /admin/403, the "signed in as a normal user,
                                   opened the staff console" case
        • session + role hint    → through to the page, where `requirePermission`
                                   verifies the real cookie with the Admin SDK and
                                   refuses if the hint was a lie

      THE ROLE HINT IS NOT A CREDENTIAL. It is readable and writable by any script
      on the origin, and forging it buys exactly one thing: the privilege of being
      refused half a millisecond later by `src/lib/admin/guard.ts`, which reads the
      signed httpOnly cookie and the custom claims inside it. Treat this file as
      UX, and the guard plus `firestore.rules` as security.
   ========================================================================== */

const SESSION_COOKIE = `${brand.slug}-session`;
const ROLE_HINT_COOKIE = `${brand.slug}-admin-role`;
const REFERRAL_COOKIE = `${brand.slug}-ref`;

const VALID_ROLE_HINTS = new Set(['super_admin', 'admin', 'finance', 'moderator', 'support']);

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

  /* Which cookie carries the session depends on the backend. Firebase mints
     `<slug>-session`; Supabase writes its own chunked `sb-<ref>-auth-token`
     cookies. Either way this is only a PRESENCE check — middleware runs on the
     Edge and verifies nothing. */
  const supabaseBackend = process.env.DATA_BACKEND !== 'firebase';
  const hasSupabaseSession = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));
  const session = supabaseBackend
    ? hasSupabaseSession
    : Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    /* `next` is carried so a deep link survives the round-trip. It is validated
       as a same-origin admin path on the login side; an open redirect on a login
       page is a phishing primitive. */
    url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  /* The role hint exists only on the Firebase path, where it saves a non-staff
     visitor a rendered shell. On Supabase the role lives in `public.staff`,
     which the Edge cannot read, so the hint is skipped and the real decision is
     made by `requirePermission()` against that table. Skipping a cosmetic hint
     costs one rendered redirect; it grants nothing, because the hint was never a
     credential. */
  if (!supabaseBackend) {
    const roleHint = request.cookies.get(ROLE_HINT_COOKIE)?.value;
    if (!roleHint || !VALID_ROLE_HINTS.has(roleHint)) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/403';
      url.search = '';
      url.searchParams.set('reason', 'not-staff');
      return NextResponse.redirect(url);
    }
  }

  /* Looks like staff. The page verifies for real. `x-admin-route` is a
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
