import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { cookies as cookieNames } from '@/lib/brand';

import { readAdminClaims, type AdminClaims, type DecodedTokenLike } from './claims';
import { canWithGrants, PERM_META, ROLES, type AdminRole, type Permission } from './rbac';

/* ============================================================================
   THE SERVER GUARD — THIS IS THE REAL ONE
   ============================================================================

   ██  READ THIS BEFORE YOU TRUST ANY PERMISSION CHECK IN THIS CODEBASE  ██

   The permission-filtered sidebar, the `<PermissionGate>` component, the
   disabled buttons and the hidden danger zones are USER EXPERIENCE ONLY. Every
   one of them runs in a browser, on a bundle the caller controls. A
   `can(role, perm)` that returns false in React is a suggestion. Anyone with
   devtools open can flip it, and anyone with `curl` never loaded it at all.

   `requirePermission()` in this file is the check that stops a request. It:
     1. reads the httpOnly session cookie the browser cannot script,
     2. verifies it server-side with the Admin SDK against Google's keys, with
        `checkRevoked: true` so a revoked session dies immediately,
     3. reads the role from the VERIFIED token's custom claims — never from a
        header, a query parameter, a request body, or a mirror document,
     4. redirects or 403s if the permission is missing.

   And even this is not the last line. A caller who never touches our server —
   hitting the Firestore REST API with a stolen ID token — bypasses this file
   entirely. That is why the same permission is re-checked in firestore.rules.
   Three layers, deliberately:

     Client gate        cosmetic       stops nobody, helps everybody
     THIS FILE          server-side    stops a browser
     Rules              data-side      stops a client that skipped the server

   NO DEMO MODE. An earlier revision of this file fabricated a signed-in
   super_admin whenever the Firebase config was absent, so the console could be
   reviewed without a project. That is gone. A console that lets you in without
   a verified credential is a console that will eventually do it somewhere it
   matters. With no credentials configured, `/admin` redirects to the staff
   login and stays there.
   ============================================================================ */

export const SESSION_COOKIE = cookieNames.session;

/**
 * A NON-httpOnly hint cookie carrying only the role string.
 *
 * It exists for one reason: Next middleware runs on the Edge runtime, where
 * `firebase-admin` (Node crypto, JWKS fetching, a long-lived key cache) cannot
 * run, so middleware cannot verify a Firebase session cookie. It can only
 * answer "does this request even claim to be staff?" cheaply, so an anonymous
 * visitor gets a clean redirect instead of a rendered shell.
 *
 * IT IS NOT A CREDENTIAL AND IS NEVER TRUSTED. Forging it gets you past
 * middleware and straight into `requirePermission()`, which reads the real,
 * signed session cookie and refuses. Treat it exactly like a `?role=` query
 * parameter you happened to find on the request.
 */
export const ROLE_HINT_COOKIE = cookieNames.adminRole;

export interface AdminSession {
  uid: string;
  email: string | null;
  claims: AdminClaims;
  role: AdminRole;
  /** Display name from `/staff/{uid}`, when there is one. */
  name: string;
  /** Effective per-user permission override, if any. */
  perms?: readonly Permission[] | undefined;
}

/**
 * Verify the session cookie and return the staff session, or null.
 *
 * Never throws for an unauthenticated caller — "not signed in" is a normal
 * outcome, not an exception.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  // Dynamic import keeps `firebase-admin` out of any bundle that merely imports
  // the types from this module.
  const { getAdminAuth } = await import('@/lib/firebase/admin');

  let decoded: DecodedTokenLike;
  try {
    /* `checkRevoked: true` is the whole point of a session cookie over a bearer
       ID token. It costs one round-trip and it is what makes "revoke this
       admin's sessions" mean something within seconds rather than within an
       hour. */
    decoded = (await getAdminAuth().verifySessionCookie(cookie, true)) as unknown as DecodedTokenLike;
  } catch {
    return null; // expired, revoked, or forged
  }

  const claims = readAdminClaims(decoded);
  if (!claims) return null; // authenticated, but not staff

  /* MFA is mandatory for staff. A staff token that somehow lacks it is treated
     as not-staff rather than as a warning. Set STAFF_REQUIRE_MFA=false only
     while enrolling the very first admin account, then remove it. */
  const requireMfa = (process.env.STAFF_REQUIRE_MFA ?? 'true') !== 'false';
  if (requireMfa && decoded['mfa'] !== true) return null;

  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    name: await staffName(decoded.uid, decoded.email ?? null),
    role: claims.role,
    claims,
    perms: claims.perms,
  };
}

/** Display name from `/staff/{uid}`, falling back to the email local part. */
async function staffName(uid: string, email: string | null): Promise<string> {
  try {
    const { getAdminDb } = await import('@/lib/firebase/admin');
    const snap = await getAdminDb().doc(`staff/${uid}`).get();
    const value = snap.exists ? snap.get('name') : null;
    if (typeof value === 'string' && value.trim()) return value;
  } catch {
    // A missing staff record is cosmetic; the role came from the verified token.
  }
  return email?.split('@')[0] ?? uid;
}

export class PermissionDeniedError extends Error {
  constructor(
    readonly perm: Permission,
    readonly role: AdminRole,
  ) {
    super(`Missing permission ${perm} for role ${role}`);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Require a staff session, whatever their role.
 *
 * Redirects to the staff login when there is none. Use at the top of the admin
 * layout; individual pages should use `requirePermission()` instead, because a
 * page that only checks "is staff" is a page every Support agent can open.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');
  return session;
}

/**
 * Require a specific permission.
 *
 * On failure it does NOT throw a raw error into the React tree. It redirects to
 * `/admin/403`, which names the missing permission — "Forbidden" teaches an
 * admin nothing and generates a ticket.
 *
 * @param opts.mode 'redirect' (default) for pages; 'throw' for Route Handlers
 *                  that must answer with JSON rather than HTML.
 */
export async function requirePermission(
  perm: Permission,
  opts: { mode?: 'redirect' | 'throw' } = {},
): Promise<AdminSession> {
  if (opts.mode === 'throw') {
    const session = await getAdminSession();
    if (!session) throw new PermissionDeniedError(perm, 'support');
    if (!canWithGrants(session.role, perm, { perms: session.perms })) {
      throw new PermissionDeniedError(perm, session.role);
    }
    return session;
  }

  const session = await requireAdmin();
  if (!canWithGrants(session.role, perm, { perms: session.perms })) {
    redirect(`/admin/403?perm=${encodeURIComponent(perm)}`);
  }
  return session;
}

/**
 * Non-redirecting variant, for a page that renders a partial view rather than
 * refusing outright — the command centre shows the KPIs you can see and omits
 * the ones you cannot, instead of 403-ing a Support agent off the home screen.
 */
export async function checkPermission(perm: Permission): Promise<boolean> {
  const session = await getAdminSession();
  if (!session) return false;
  return canWithGrants(session.role, perm, { perms: session.perms });
}

/** A bound `can` for a session, so pages read `allow('user.ban')`. */
export const allowFor =
  (session: Pick<AdminSession, 'role' | 'perms'>) =>
  (perm: Permission): boolean =>
    canWithGrants(session.role, perm, { perms: session.perms });

/* ---- REFUSAL COPY -----------------------------------------------------------
   One function so every refusal — the 403 page, a toast, a JSON error body —
   says the same thing, names the same permission, and points at the same
   remedy.                                                                   */
export function denialCopy(perm: Permission, role: AdminRole): {
  title: string;
  permLabel: string;
  roleLabel: string;
  body: string;
} {
  return {
    title: `You don't have access to ${PERM_META[perm].group}`,
    permLabel: PERM_META[perm].label,
    roleLabel: ROLES[role].label,
    body: `This page needs ${perm} — "${PERM_META[perm].label}". Your role (${ROLES[role].label}) doesn't hold it.`,
  };
}
