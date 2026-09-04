import 'server-only';

import { cookies } from 'next/headers';
import { cache } from 'react';

import { isSupabaseBackend } from '@/lib/backend';
import { getSsrSupabase } from '@/lib/supabase/server';
import { getAdminAuth } from '@/lib/firebase/admin';
import { cookies as cookieNames } from '@/lib/brand';
import type { Viewer } from '@/lib/models';

import { forbidden, isServerFirebaseReady, unauthorized } from './db';

/* ============================================================================
   SESSION
   ----------------------------------------------------------------------------
   The browser holds one credential: an httpOnly, Secure, SameSite=Lax session
   cookie minted by the Admin SDK from a freshly-issued Firebase ID token.

   WHY NOT JUST USE THE ID TOKEN
   The ID token lives in IndexedDB, readable by any script on the origin. One
   XSS and an attacker holds a bearer token for an hour. It also cannot be
   revoked before it expires, and Server Components cannot read IndexedDB — so
   without the cookie every authenticated page would be a Client Component
   waiting on `onAuthStateChanged`, which is the logged-out flash on every
   navigation that every Firebase app suffers from.

   THE FRESHNESS CHECK
   `verifyIdToken` is followed by an `auth_time` window check before minting.
   That is what stops a stolen refresh token from being upgraded into a
   fourteen-day session cookie: the caller must have actually authenticated in
   the last few minutes.

   THE ROLE HINT
   A second, NON-httpOnly cookie carries the admin role so Edge middleware can
   route `/admin` without a Firestore round-trip. It is not a credential and is
   never trusted for authorisation — `requireAdmin()` below re-reads the signed
   session cookie and the custom claims inside it.
   ========================================================================== */

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** How recently the caller must have authenticated to mint a session. */
const MAX_AUTH_AGE_SECONDS = 10 * 60;

export interface SessionClaims {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  admin: boolean;
  adminRole: string | null;
  support: boolean;
  advertiser: boolean;
}

function claimsFrom(decoded: Record<string, unknown>): SessionClaims {
  const role = typeof decoded.adminRole === 'string' ? decoded.adminRole : null;
  return {
    uid: String(decoded.uid ?? ''),
    email: typeof decoded.email === 'string' ? decoded.email : null,
    emailVerified: decoded.email_verified === true,
    name: typeof decoded.name === 'string' ? decoded.name : null,
    admin: decoded.admin === true || Boolean(role),
    adminRole: role,
    support: decoded.support === true,
    advertiser: decoded.advertiser === true,
  };
}

/* ---- MINT / DESTROY ------------------------------------------------------- */

export interface MintResult {
  claims: SessionClaims;
  expiresAt: number;
}

/**
 * Exchange a fresh ID token for a session cookie and set it. Called only by
 * `POST /api/auth/session`.
 */
export async function mintSession(idToken: string): Promise<MintResult> {
  const auth = getAdminAuth();
  const decoded = await auth.verifyIdToken(idToken, true);

  const authAge = Date.now() / 1000 - Number(decoded.auth_time ?? 0);
  if (!Number.isFinite(authAge) || authAge > MAX_AUTH_AGE_SECONDS) {
    throw unauthorized('Sign in again — that credential is too old to start a session.');
  }

  const cookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_TTL_MS });
  const claims = claimsFrom(decoded as unknown as Record<string, unknown>);
  const store = await cookies();

  store.set(cookieNames.session, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });

  /* Readable by JS on purpose: middleware runs on the Edge, where the Admin SDK
     cannot verify anything, and this lets it route /admin without a redirect
     loop. Forging it buys the privilege of being refused by requireAdmin(). */
  if (claims.adminRole) {
    store.set(cookieNames.adminRole, claims.adminRole, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_MS / 1000,
    });
  } else {
    store.delete(cookieNames.adminRole);
  }

  return { claims, expiresAt: Date.now() + SESSION_TTL_MS };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const value = store.get(cookieNames.session)?.value;

  /* Revoke refresh tokens as well as clearing the cookie. Without this, "sign
     out of all devices" only signs out this one. */
  if (value && isServerFirebaseReady()) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(value, false);
      await getAdminAuth().revokeRefreshTokens(decoded.sub);
    } catch {
      // Already expired or malformed. Clearing the cookie is enough.
    }
  }

  store.delete(cookieNames.session);
  store.delete(cookieNames.adminRole);
}

/* ---- READ ---------------------------------------------------------------- */

/**
 * Current viewer's claims, or null. Memoised per request, so a layout, a page
 * and three components all reading the session cost one verification.
 */
export const getSessionClaims = cache(async (): Promise<SessionClaims | null> => {
  /* Supabase backend: read the httpOnly session cookie via the SSR client. */
  if (isSupabaseBackend) {
    try {
      const supabase = await getSsrSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      return claimsFrom({
        uid: user.id,
        email: user.email ?? null,
        email_verified: user.email_confirmed_at ? true : false,
        name: user.user_metadata?.username ?? null,
      });
    } catch {
      return null;
    }
  }

  if (!isServerFirebaseReady()) return null;

  const store = await cookies();
  const value = store.get(cookieNames.session)?.value;
  if (!value) return null;

  try {
    // checkRevoked: true costs one round-trip and is what makes revocation real.
    const decoded = await getAdminAuth().verifySessionCookie(value, true);
    return claimsFrom(decoded as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
});

/** Claims plus display fields, for headers and avatars. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const claims = await getSessionClaims();
  if (!claims) return null;

  const username = claims.name ?? claims.email?.split('@')[0] ?? 'member';
  return {
    uid: claims.uid,
    email: claims.email,
    emailVerified: claims.emailVerified,
    username,
    initials: initialsFor(username),
    admin: claims.admin,
    adminRole: claims.adminRole,
  };
});

export function initialsFor(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
  if (!cleaned) return 'VZ';
  const parts = cleaned.split(/\s+/);
  if (parts.length > 1) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

/* ---- GUARDS -------------------------------------------------------------- */

export async function requireUser(): Promise<SessionClaims> {
  const claims = await getSessionClaims();
  if (!claims) throw unauthorized();
  return claims;
}

export async function requireVerifiedUser(): Promise<SessionClaims> {
  const claims = await requireUser();
  if (!claims.emailVerified) {
    throw forbidden('Verify your email address first — check your inbox for the link.');
  }
  return claims;
}

export async function requireAdmin(): Promise<SessionClaims> {
  const claims = await requireUser();
  if (!claims.admin) throw forbidden('Staff access only.');
  return claims;
}
