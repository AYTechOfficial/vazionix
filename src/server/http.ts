import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { AppError } from './db';

/* ============================================================================
   ROUTE HELPERS
   ----------------------------------------------------------------------------
   Every API route in the product is `export const POST = handler(async (ctx) =>
   …)`. The wrapper does four things that would otherwise be copy-pasted into
   thirty files and get subtly wrong in one of them:

   1. TURNS `AppError` INTO A CLEAN 4xx. Anything else becomes a 500 with a
      generic message and a server-side log. A Firestore error string in a toast
      tells a user nothing and tells an attacker something.
   2. RESOLVES THE CLIENT IP once, from the headers the CDN actually sets. Every
      anti-fraud check and every captcha verification needs it.
   3. PARSES JSON DEFENSIVELY. A malformed body is a 400, not an unhandled
      rejection.
   4. SETS `no-store`. These are all authenticated, per-user responses; a CDN
      caching one would serve one user's balance to another.
   ========================================================================== */

export interface RouteContext<P = Record<string, string>> {
  request: NextRequest;
  params: P;
  ip: string | null;
  userAgent: string | null;
  /** Parsed JSON body, or `{}` for GET / empty bodies. */
  body: <T = Record<string, unknown>>() => Promise<T>;
  /** Query string reader. */
  query: (key: string) => string | null;
}

export function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('x-vercel-forwarded-for') ??
    null
  );
}

/** Two-letter country from the CDN's geo header, when the platform provides one. */
export function clientCountry(request: NextRequest): string | null {
  const code =
    request.headers.get('cf-ipcountry') ??
    request.headers.get('x-vercel-ip-country') ??
    request.headers.get('x-country-code');
  if (!code || code === 'XX' || code.length !== 2) return null;
  return code.toUpperCase();
}

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' } as const;

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data as Record<string, unknown>, { status, headers: NO_STORE });
}

export function fail(message: string, status = 400, code = 'error', extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: false, error: message, code, ...extra }, { status, headers: NO_STORE });
}

type Handler<P> = (ctx: RouteContext<P>) => Promise<NextResponse> | NextResponse;

/**
 * The second argument is REQUIRED and `params` is a Promise, because that is what
 * Next 15 generates its route-type check against. An optional context, or a
 * `params` typed as `P | Promise<P>`, fails `next build` with a `ParamCheck`
 * mismatch even though it works at runtime — the generated `.next/types` for a
 * static route still declares the parameter. It is awaited defensively so a route
 * with no dynamic segments behaves.
 */
export function handler<P extends Record<string, string> = Record<string, string>>(fn: Handler<P>) {
  return async (request: NextRequest, context: { params: Promise<P> }): Promise<NextResponse> => {
    let params = {} as P;
    const raw = context?.params as Promise<P> | P | undefined;
    if (raw) params = await raw;

    const ctx: RouteContext<P> = {
      request,
      params,
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
      body: async <T,>() => {
        try {
          const text = await request.text();
          return (text ? JSON.parse(text) : {}) as T;
        } catch {
          throw new AppError('Malformed request body.', 400, 'bad_json');
        }
      },
      query: (key: string) => request.nextUrl.searchParams.get(key),
    };

    try {
      return await fn(ctx);
    } catch (error) {
      if (error instanceof AppError) {
        return fail(error.message, error.status, error.code, error.extra);
      }

      /* Firebase Admin errors carry useful codes but also internal detail. Map
         the two that users can act on, and swallow the rest. */
      const code = (error as { code?: string })?.code ?? '';
      if (code === 'auth/id-token-expired' || code === 'auth/session-cookie-expired') {
        return fail('Your session expired. Sign in again.', 401, 'session_expired');
      }
      if (code === 'permission-denied') {
        return fail('You do not have access to that.', 403, 'forbidden');
      }

      console.error('[api] unhandled error', error);
      return fail('Something went wrong on our side. Try again.', 500, 'internal');
    }
  };
}

/** Read a required string field from a JSON body. */
export function requireString(body: Record<string, unknown>, key: string, max = 400): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(`Missing "${key}".`, 400, 'missing_field');
  }
  if (value.length > max) throw new AppError(`"${key}" is too long.`, 400, 'field_too_long');
  return value.trim();
}

export function optionalString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function requireNumber(body: Record<string, unknown>, key: string): number {
  const value = Number(body[key]);
  if (!Number.isFinite(value)) throw new AppError(`Missing or invalid "${key}".`, 400, 'missing_field');
  return value;
}
