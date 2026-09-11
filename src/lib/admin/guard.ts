import 'server-only';

import { redirect } from 'next/navigation';

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
     1. verifies the Supabase session server-side (supabase.auth.getUser()
        against the httpOnly cookie — a signature check, not a payload read),
     2. reads the role from public.staff, a table whose RLS denies every role
        but service_role — which only the server holds. Never from a header,
        a query parameter, a request body, or anything the caller can write,
     3. redirects or 403s if the permission is missing.

   NO DEMO MODE. A console that lets you in without a verified credential is a
   console that will eventually do it somewhere it matters. With no credentials
   configured, `/admin` redirects to the staff login and stays there.
   ========================================================================== */

export interface AdminSession {
  uid: string;
  email: string | null;
  claims: { role: AdminRole; perms?: readonly Permission[] };
  role: AdminRole;
  /** Display name from `public.staff`, when there is one. */
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
  const { getSessionClaims } = await import('@/server/session');
  const session = await getSessionClaims();
  if (!session) return null;

  const { supabaseGetStaff } = await import('@/server/data-supabase');
  let staff: Record<string, unknown> | null = null;
  try {
    staff = await supabaseGetStaff(session.uid);
  } catch {
    return null;
  }
  if (!staff) return null; // authenticated, but not staff

  const role = String(staff.role ?? '') as AdminRole;
  if (!ROLES[role]) return null;

  /* MFA stays mandatory for staff, and is recorded per staff row. Set
     STAFF_REQUIRE_MFA=false only while enrolling the very first admin, then
     remove it. */
  const requireMfa = (process.env.STAFF_REQUIRE_MFA ?? 'true') !== 'false';
  if (requireMfa && staff.mfa !== true) return null;

  const perms = Array.isArray(staff.perms) ? (staff.perms as Permission[]) : undefined;
  return {
    uid: session.uid,
    email: session.email,
    name:
      (typeof staff.name === 'string' && staff.name.trim()) ||
      session.email?.split('@')[0] ||
      session.uid,
    role,
    claims: { role, ...(perms ? { perms } : {}) },
    perms,
  };
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
