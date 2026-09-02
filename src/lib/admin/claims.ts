import 'server-only';

import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import {
  ALL_PERMS,
  ROLES,
  isAdminRole,
  isPermission,
  type AdminRole,
  type Permission,
} from './rbac';

/* ============================================================================
   ADMIN CUSTOM CLAIMS
   ----------------------------------------------------------------------------
   The staff authorisation model in one object:

       { role: 'finance', perms?: ['fraud.review'], mfa: true }

   WHY CLAIMS AND NOT A FIRESTORE DOCUMENT
   Claims are embedded in the signed ID token. Reading them costs zero document
   reads, they are available to `firestore.rules` (`request.auth.token.role`)
   without a `get()`, and they are available to a Cloud Function without a
   round-trip. A `/staff/{uid}` lookup in a security rule costs a document
   read on EVERY rule evaluation, which on a listing screen means one read per
   row just to decide whether you may see the row.

   THE COST, STATED PLAINLY
   Claims are baked into a token at sign-in and live until it refreshes (one
   hour, or sooner if the client calls `getIdToken(true)`). So a demotion is not
   instant. Two mitigations, both implemented in `setAdminRole` below:
     • `revokeRefreshTokens(uid)` — forces the next refresh to fail, and
       `verifySessionCookie(cookie, checkRevoked = true)` in `guard.ts`
       rejects the current session immediately.
     • the mirror document `/staff/{uid}` is written in the same call, so
       the staff table never shows a role the token no longer carries.

   `mfa: true` is not decoration. Every staff account is required to enrol TOTP
   (`securityConfig.force2fa`), and `requireAdmin()` refuses a session whose
   claim says otherwise — a staff console reachable with a password alone is
   one phishing email from a total compromise.
   ========================================================================== */

export const ADMIN_CLAIM_ROLE = 'role' as const;
export const ADMIN_CLAIM_PERMS = 'perms' as const;
export const ADMIN_CLAIM_MFA = 'mfa' as const;

export interface AdminClaims {
  role: AdminRole;
  /**
   * Optional per-user override. When present it REPLACES the role's grant
   * rather than adding to it — see `canWithGrants`. Used for the
   * "Finance, plus fraud.review for the duration of this investigation" case,
   * and deliberately awkward to set so it does not become the norm.
   *
   * Kept small on purpose: custom claims have a hard 1000-byte limit across
   * the whole object, and 53 permission strings do not fit. `MAX_PERM_CLAIMS`
   * below is the enforced ceiling.
   */
  perms?: readonly Permission[];
  /** TOTP enrolled and satisfied for this session. Always true in practice. */
  mfa: true;
}

/** Firebase caps the serialised custom-claims object at 1000 bytes. A
    permission id averages ~18 bytes with JSON quoting and a comma, so 24 is a
    safe ceiling that leaves room for `role` and `mfa`. Beyond that, the answer
    is a new role, not a longer list. */
export const MAX_PERM_CLAIMS = 24;

/** The decoded-token shape we actually consume. Structurally compatible with
    `DecodedIdToken` from firebase-admin, but not tied to it, so the pure
    readers below can be unit-tested against a plain object. */
export interface DecodedTokenLike {
  uid: string;
  email?: string | undefined;
  auth_time?: number | undefined;
  [claim: string]: unknown;
}

/* ---- READERS ----------------------------------------------------------------
   Deliberately total functions returning `null` rather than throwing: a token
   with no admin claim is the overwhelmingly common case (every one of the
   1.8M end users has one), and it is not an error, it is a "no".          */

/** Extracts and validates the admin claims from a DECODED token.
    Returns null when the token carries no valid admin role. */
export function readAdminClaims(token: DecodedTokenLike | null | undefined): AdminClaims | null {
  if (!token) return null;

  const role = token[ADMIN_CLAIM_ROLE];
  if (!isAdminRole(role)) return null;

  // An unknown permission string in the claim is dropped rather than
  // rejected: a permission removed from the catalogue in a deploy should not
  // lock out every admin holding it in a live token.
  const rawPerms = token[ADMIN_CLAIM_PERMS];
  const perms = Array.isArray(rawPerms) ? rawPerms.filter(isPermission) : undefined;

  return {
    role,
    ...(perms && perms.length ? { perms } : {}),
    mfa: true,
  };
}

/** True when the token belongs to any member of staff. */
export const hasAdminClaims = (token: DecodedTokenLike | null | undefined): boolean =>
  readAdminClaims(token) !== null;

/** True when the token's MFA claim is satisfied. A staff token without it is
    treated as unauthenticated by `requireAdmin()`. */
export const hasMfa = (token: DecodedTokenLike | null | undefined): boolean =>
  token?.[ADMIN_CLAIM_MFA] === true;

/** The claim object to hand to `setCustomUserClaims`. Exported so a bootstrap
    script and a test can build the identical payload. */
export function buildAdminClaims(
  role: AdminRole,
  perms?: readonly Permission[],
): Record<string, unknown> {
  const trimmed = perms?.filter(isPermission).slice(0, MAX_PERM_CLAIMS);
  return {
    [ADMIN_CLAIM_ROLE]: role,
    ...(trimmed && trimmed.length ? { [ADMIN_CLAIM_PERMS]: trimmed } : {}),
    [ADMIN_CLAIM_MFA]: true,
  };
}

/* ---- WRITER -----------------------------------------------------------------
   The single place a staff role is granted. Everything about it is designed
   around the fact that this is the privilege-escalation primitive of the whole
   product: whoever can call it can make themselves anything.              */

export interface SetAdminRoleInput {
  /** Target staff uid. */
  uid: string;
  role: AdminRole;
  perms?: readonly Permission[];
  /** The CALLER's claims, already verified by `requireAdmin()`. Passing them
      in rather than re-reading them makes it impossible to call this function
      without having authenticated somebody first. */
  actor: { uid: string; claims: AdminClaims };
  /** Mandatory. Written to the audit row; a role change with no stated reason
      is indistinguishable from an attack after the fact. */
  reason: string;
}

export class AdminRoleError extends Error {
  constructor(
    message: string,
    readonly code: 'forbidden' | 'invalid' | 'self' | 'not-configured',
  ) {
    super(message);
    this.name = 'AdminRoleError';
  }
}

/**
 * Grant or change a staff role. **`super_admin` only.**
 *
 * Enforced here, again in `setAdminRoleCallable` (functions/src/index.ts), and
 * again in `firestore.rules` for the `/staff/{uid}` mirror write. Three
 * layers for one operation is not paranoia — it is the operation that creates
 * the actor every other layer trusts.
 *
 * Guards, in order:
 *   1. Caller must hold `super_admin`. Not `roles.edit`, not `admin.manage` —
 *      the role itself. A permission that grants roles can be granted; the
 *      role cannot, except by another super_admin.
 *   2. Caller may not change their OWN role. A super_admin cannot demote
 *      themselves into a corner, and — more importantly — a compromised
 *      account cannot quietly re-badge itself to look like Support in the
 *      staff table while keeping its claims.
 *   3. `perms` is validated and capped at `MAX_PERM_CLAIMS`.
 *   4. Refresh tokens are revoked so the change takes effect on the next
 *      request rather than in up to an hour.
 *   5. The mirror document and the audit row are written; the audit row is
 *      written LAST and is never conditional.
 */
export async function setAdminRole(input: SetAdminRoleInput): Promise<void> {
  const { uid, role, perms, actor, reason } = input;

  if (actor.claims.role !== 'super_admin') {
    throw new AdminRoleError(
      'Only a Super Admin can change a staff role. Your role cannot edit the permission matrix.',
      'forbidden',
    );
  }
  if (actor.uid === uid) {
    throw new AdminRoleError(
      'You cannot change your own role. Ask another Super Admin.',
      'self',
    );
  }
  if (!isAdminRole(role)) {
    throw new AdminRoleError(`"${String(role)}" is not a staff role.`, 'invalid');
  }
  if (!reason.trim()) {
    throw new AdminRoleError('A reason is required — it goes into the audit log.', 'invalid');
  }
  if (perms && perms.some((p) => !isPermission(p))) {
    throw new AdminRoleError('One or more permissions are not in the catalogue.', 'invalid');
  }
  if (perms && perms.length > MAX_PERM_CLAIMS) {
    throw new AdminRoleError(
      `A per-user override may hold at most ${MAX_PERM_CLAIMS} permissions (custom claims are capped at 1000 bytes). Create a role instead.`,
      'invalid',
    );
  }

  const auth = getAdminAuth();
  const db = getAdminDb();

  const before = await auth.getUser(uid);
  const previousRole = readAdminClaims(before.customClaims as DecodedTokenLike | undefined)?.role ?? 'none';

  await auth.setCustomUserClaims(uid, buildAdminClaims(role, perms));

  // Force every existing session for this uid to re-verify. Without this, a
  // demotion is only effective when the ID token next refreshes.
  await auth.revokeRefreshTokens(uid);

  /* `/staff/{uid}` and not `/adminUsers/{uid}`: the guard reads the display name
     from `/staff`, and `setStaffRole` in the functions bundle mirrors there too.
     Two collections holding the same fact is how a rename ends up showing the old
     name in the console for a week. */
  await db.doc(`staff/${uid}`).set(
    {
      uid,
      name: before.displayName ?? before.email?.split('@')[0] ?? uid,
      role,
      perms: perms ?? null,
      email: before.email ?? null,
      updatedAt: new Date(),
      updatedBy: actor.uid,
    },
    { merge: true },
  );

  /* Field names match `src/server/admin.ts#writeAudit` and
     `functions/src/ledger.ts#auditDoc` exactly. Three writers land in
     `/auditLog` and the console reads one shape; a row with different key names
     renders blank in the audit table, which is the worst possible failure for an
     audit trail — the action looks unlogged rather than mis-logged. */
  await db.collection('auditLog').add({
    actorUid: actor.uid,
    /* The caller's claims carry a role, not an email — `requireAdmin()` verified
       the token but did not fetch the user record. The console resolves a display
       name from `/staff/{uid}` when it renders the row, so the uid is enough here
       and one fewer Auth lookup runs on the hot path. */
    actorName: actor.uid,
    action: 'roles.edit' satisfies Permission,
    target: uid,
    detail: `${before.email ?? uid}: ${previousRole} → ${role} · ${reason.trim()}`,
    before: `role=${previousRole}`,
    after: `role=${role}`,
    ip: null,
    createdAt: new Date(),
  });
}

/** Every permission a role holds, for seeding `/roleGrants/{role}` on first
    deploy. Kept here rather than in rbac.ts so the seed and the claim writer
    are read together. */
export const defaultGrantsFor = (role: AdminRole): readonly Permission[] =>
  role === 'super_admin' ? ALL_PERMS : ROLES[role].perms;
