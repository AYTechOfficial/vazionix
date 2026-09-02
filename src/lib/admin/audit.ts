import 'server-only';

import type { Transaction } from 'firebase-admin/firestore';

import { getAdminDb } from '@/lib/firebase/admin';
import { getSiteConfig } from '@/server/config';
import { isServerFirebaseReady } from '@/server/db';

import { canWithGrants, PERM_META, ROLES, type Permission } from './rbac';
import type { AdminSession } from './guard';

/* ============================================================================
   THE GUARDED MUTATION
   ----------------------------------------------------------------------------
   Every mutating action in the console routes through `act()`, which does three
   things in this order, all mandatory:

     1. CHECK. The permission is re-derived from the VERIFIED session, never from
        anything the caller sent.
     2. REFUSE UNDER LOCKDOWN. Money permissions are frozen while the platform is
        locked down, regardless of role. A break-glass switch a sufficiently senior
        person can talk their way around is not a break-glass switch.
     3. WRITE THE ROW. `withAudit` writes the audit entry inside the same
        transaction as the change. A mutation that succeeds while its audit write
        fails is precisely the pair you cannot afford. The reverse — a row for an
        action that then failed — is merely noise, and the row records the failure.

   `/auditLog` is create-only in firestore.rules: no client create, and no update
   or delete for anybody including staff. The Admin SDK bypasses rules, which is
   exactly why the rule forbids updates rather than trusting nobody to write them.
   ========================================================================== */

/** Permissions frozen by a platform lockdown. */
export const LOCKDOWN_FROZEN_PERMS: readonly Permission[] = [
  'withdrawal.approve',
  'withdrawal.batch',
  'withdrawal.reverse',
  'balance.adjust',
];

export interface AuditWrite {
  perm: Permission;
  /** Human description of the thing acted on: "Withdrawal 8f2c…". */
  target: string;
  before: string;
  after: string;
  /** Source IP, captured server-side. Never a client header unless it has been
      through a trusted proxy that overwrites it. */
  ip?: string | null;
}

export interface AuditEntry {
  id: string;
  admin: string;
  perm: Permission;
  target: string;
  before: string;
  after: string;
  /** ISO. */
  at: string;
  ip: string | null;
}

export type ActResult =
  | { ok: true; entry: AuditEntry }
  | { ok: false; reason: 'permission' | 'lockdown'; message: string };

/**
 * Permission check, lockdown check and audit write in one call.
 *
 * Returns a result rather than throwing: every caller has a specific refusal to
 * render, and a generic 500 is the wrong answer to "your role cannot do that".
 * The wording comes from `PERM_META`, so a refusal names the capability rather
 * than the permission code.
 */
export async function act(session: AdminSession, write: AuditWrite): Promise<ActResult> {
  if (!canWithGrants(session.role, write.perm, { perms: session.perms })) {
    return {
      ok: false,
      reason: 'permission',
      message: `Your role (${ROLES[session.role].label}) cannot ${PERM_META[write.perm].label.toLowerCase()}`,
    };
  }

  const site = await getSiteConfig();
  /* Maintenance mode is the lockdown signal: it is the one flag that already
     stops earning and withdrawals for users, so freezing staff money actions
     behind the same switch keeps one kill switch rather than two that can
     disagree. */
  if (site.maintenance && LOCKDOWN_FROZEN_PERMS.includes(write.perm)) {
    return {
      ok: false,
      reason: 'lockdown',
      message: 'The platform is in maintenance mode — money actions are frozen until it is lifted',
    };
  }

  const entry = await appendAudit(session, write);
  return { ok: true, entry };
}

/**
 * Append an audit row. Unconditional — call it even for a refused action when the
 * refusal is itself interesting; repeated denied attempts on `balance.adjust` are
 * a signal, not noise.
 */
export async function appendAudit(session: AdminSession, write: AuditWrite): Promise<AuditEntry> {
  const at = new Date().toISOString();
  const entry: AuditEntry = {
    id: `pending-${Date.now().toString(36)}`,
    admin: session.uid,
    perm: write.perm,
    target: write.target,
    before: String(write.before),
    after: String(write.after),
    at,
    ip: write.ip ?? null,
  };

  if (!isServerFirebaseReady()) return entry;

  const ref = await getAdminDb().collection('auditLog').add({
    actorUid: session.uid,
    actorName: session.name,
    action: write.perm,
    target: write.target,
    detail: `${write.before} → ${write.after}`,
    before: entry.before,
    after: entry.after,
    ip: entry.ip,
    createdAt: new Date(),
  });

  return { ...entry, id: ref.id };
}

/**
 * Run a Firestore mutation and its audit row in ONE transaction.
 *
 * Use this for anything that changes a balance, a payout status or an account
 * state. `act()` alone is fine for actions whose effect is outside Firestore
 * (sending an email, generating an export); it is not fine for a balance
 * adjustment, where a successful debit with no audit row is unreconcilable.
 */
export async function withAudit<T>(
  session: AdminSession,
  write: AuditWrite,
  mutate: (tx: Transaction) => Promise<T>,
): Promise<ActResult & { value?: T }> {
  if (!canWithGrants(session.role, write.perm, { perms: session.perms })) {
    return {
      ok: false,
      reason: 'permission',
      message: `Your role (${ROLES[session.role].label}) cannot ${PERM_META[write.perm].label.toLowerCase()}`,
    };
  }

  const site = await getSiteConfig();
  if (site.maintenance && LOCKDOWN_FROZEN_PERMS.includes(write.perm)) {
    return {
      ok: false,
      reason: 'lockdown',
      message: 'The platform is in maintenance mode — money actions are frozen until it is lifted',
    };
  }

  if (!isServerFirebaseReady()) {
    throw new Error('Firebase credentials are not configured on the server.');
  }

  const db = getAdminDb();
  const value = await db.runTransaction(async (tx) => {
    const result = await mutate(tx);
    tx.create(db.collection('auditLog').doc(), {
      actorUid: session.uid,
      actorName: session.name,
      action: write.perm,
      target: write.target,
      detail: `${write.before} → ${write.after}`,
      before: write.before,
      after: write.after,
      ip: write.ip ?? null,
      createdAt: new Date(),
    });
    return result;
  });

  return { ok: true, entry: await appendAudit(session, write), value };
}
