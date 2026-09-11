import 'server-only';

import { cache } from 'react';

import { getSsrSupabase } from '@/lib/supabase/server';
import type { Viewer } from '@/lib/models';

import { forbidden, unauthorized } from './db';

/* ============================================================================
   SESSION
   ----------------------------------------------------------------------------
   The browser holds one credential: the httpOnly, encrypted Supabase auth
   cookies written by @supabase/ssr on sign-in. Server Components and Route
   Handlers read the session from those cookies via getSsrSupabase() and verify
   it with supabase.auth.getUser() — a server-side signature check against
   Supabase's auth server, not a decode-and-trust.

   Server-side mutations that must bypass RLS (the money path) use the
   service-role client in src/server/supabase.ts, keyed by the VERIFIED user id
   from here. The browser never holds the service-role key.
   ========================================================================== */

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

function claimsFromUser(user: {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): SessionClaims {
  return {
    uid: user.id,
    email: user.email ?? null,
    emailVerified: Boolean(user.email_confirmed_at),
    name: typeof user.user_metadata?.username === 'string' ? user.user_metadata.username : null,
    admin: false, // resolved per request from public.staff in the admin guard
    adminRole: null,
    support: false,
    advertiser: false,
  };
}

/** Sign out: clear the Supabase cookies from the server side. */
export async function destroySession(): Promise<void> {
  const supabase = await getSsrSupabase();
  await supabase.auth.signOut();
}

/* ---- READ ---------------------------------------------------------------- */

/**
 * Current viewer's claims, or null. Memoised per request, so a layout, a page
 * and three components all reading the session cost one verification.
 */
export const getSessionClaims = cache(async (): Promise<SessionClaims | null> => {
  try {
    const supabase = await getSsrSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return claimsFromUser(user);
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
