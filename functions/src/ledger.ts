/* ============================================================================
   LEDGER, NOTIFICATIONS AND AUDIT — the three writes every job here shares
   ----------------------------------------------------------------------------
   `creditTokens` mirrors `../src/server/ledger.ts#credit`. It has to: the two
   write the same two documents, and a scheduled job that credits differently
   from the Route Handler would produce a ledger where identical rows mean
   different things.

   THE INVARIANT, restated because it is the reason this module exists
     balance == sum(claims.amount) - sum(withdrawal token costs) + adjustments
   A balance change with no matching `/users/{uid}/claims` document is a bug by
   definition, so both writes go in one transaction and neither can land alone.

   IDEMPOTENCY
   `idempotencyKey` becomes the claim document id. A replayed credit hits
   `tx.create` on an id that already exists, reports the original amount and
   changes nothing. The key must therefore be derived from the ACTION —
   `lb_2026-W07_faucet`, `lotto_r12_<ticketId>`, `refqual_<uid>` — never from a
   random value. Two of these keys are shared with the web app on purpose:
   `refqual_${uid}` and `wdref_${withdrawalId}`. That is what stops the trigger
   in this bundle and the Route Handler in the app from both paying.

   WHAT THIS DELIBERATELY DOES NOT DO
   It does not pay referral commission. The web app's `credit()` does, because
   everything it credits is an EARNING. Everything this bundle credits is a
   prize, a one-off bonus or a compensating entry, and a commission on a prize
   pays a referrer out of a pool that was already divided among the winners.
   ========================================================================== */

import { FieldValue, dayKey, db, int, now, str, weekKey } from './core';
import { earningBonusBps, levelFromExp, readEconomy, withBonus, type ClaimSource } from './config';

/* ---- CREDIT --------------------------------------------------------------- */

export interface CreditInput {
  uid: string;
  source: ClaimSource;
  /** Base integer tokens, before any earning bonus. */
  amount: number;
  label: string;
  exp?: number;
  refId?: string | null;
  /** Deterministic id derived from the action. See the note above. */
  idempotencyKey?: string;
  /** Prizes and compensating entries pass false so they are not uplifted. */
  applyBonus?: boolean;
  /** False keeps the credit off the leaderboards. */
  score?: boolean;
}

export interface CreditResult {
  /** Tokens actually credited, after any bonus. */
  credited: number;
  balance: number;
  claimId: string;
  /** True when the action had already been credited and nothing changed. */
  replayed: boolean;
}

/** Which leaderboard a source scores on. Sources absent here do not score.
    Same table as `../src/server/ledger.ts`. */
const BOARD_FOR: Partial<Record<ClaimSource, string>> = {
  faucet: 'faucet',
  ptc: 'ptc',
  shortlink: 'shortlink',
  offerwall: 'offerwall',
  referral: 'referral',
};

/** Which `claimCounts` counter a source increments. */
const COUNTER_FOR: Partial<Record<ClaimSource, string>> = {
  faucet: 'faucet',
  ptc: 'ptc',
  shortlink: 'shortlink',
  offerwall: 'offerwall',
  bonus: 'bonus',
  challenge: 'challenge',
};

/** Firestore document ids may not contain `/` and are capped at 1500 bytes. */
const claimId = (key: string): string => key.replace(/\//g, '_').slice(0, 400);

/**
 * Credit tokens and write the ledger row that explains them, in one
 * transaction.
 *
 * Refuses rather than guesses. A missing user document, a suspended account or
 * a zero amount throws instead of writing a partial credit: an uncredited prize
 * is a support ticket, an unexplained balance is a reconciliation.
 */
export async function creditTokens(input: CreditInput): Promise<CreditResult> {
  const economy = await readEconomy();
  const base = Math.max(0, Math.floor(input.amount));
  if (!base) throw new Error(`creditTokens: nothing to credit for ${input.uid}`);

  const userRef = db().doc(`users/${input.uid}`);
  const claims = db().collection(`users/${input.uid}/claims`);
  const claimRef = input.idempotencyKey ? claims.doc(claimId(input.idempotencyKey)) : claims.doc();

  return db().runTransaction<CreditResult>(async (tx) => {
    const [userSnap, claimSnap] = await Promise.all([tx.get(userRef), tx.get(claimRef)]);
    if (!userSnap.exists) throw new Error(`creditTokens: no user ${input.uid}`);

    const user = userSnap.data() as Record<string, unknown>;

    /* Replay: report the original credit and change nothing. */
    if (claimSnap.exists) {
      return {
        credited: int(claimSnap.get('amount')),
        balance: int(user.balance),
        claimId: claimRef.id,
        replayed: true,
      };
    }

    /* Checked AFTER the replay branch on purpose: a credit that already landed
       stays reported as landed even if the account was suspended afterwards.
       Suspending an account must not rewrite its ledger. */
    if (user.suspended === true) {
      throw new Error(`creditTokens: ${input.uid} is suspended, refusing to credit`);
    }

    const streak = int(user.streakDays);
    const totalExp = int(user.totalExp, int(user.exp));
    const { level: priorLevel } = levelFromExp(totalExp, economy.levels);

    const bonusBps =
      input.applyBonus === false
        ? 0
        : int(user.earningBonusBps, earningBonusBps(priorLevel, streak, economy.levels));

    const credited = bonusBps ? withBonus(base, bonusBps) : base;
    const exp = Math.max(0, Math.floor(input.exp ?? 0));
    const nextTotalExp = totalExp + exp;
    const { level: nextLevel, exp: levelExp } = levelFromExp(nextTotalExp, economy.levels);

    tx.create(claimRef, {
      source: input.source,
      amount: credited,
      baseAmount: base,
      exp,
      refId: input.refId ?? null,
      label: input.label,
      bonusBps,
      ip: null,
      day: dayKey(),
      createdAt: now(),
      updatedAt: now(),
    });

    const update: Record<string, unknown> = {
      balance: FieldValue.increment(credited),
      totalEarned: FieldValue.increment(credited),
      totalExp: nextTotalExp,
      exp: levelExp,
      level: nextLevel,
      updatedAt: now(),
    };

    if (nextLevel > priorLevel) {
      update.earningBonusBps = earningBonusBps(nextLevel, streak, economy.levels);
    }

    const counter = COUNTER_FOR[input.source];
    if (counter) update[`claimCounts.${counter}`] = FieldValue.increment(1);

    tx.update(userRef, update);

    const board = BOARD_FOR[input.source];
    if (board && input.score !== false) {
      /* The field set here must match `../src/server/ledger.ts` exactly. Both
         writers merge into the same document, and an entry whose first write came
         from this bundle would otherwise be missing `period`, `finalRank` and
         `prizeTokens` — fields `resetLeaderboards` reads back off the archive on a
         re-run. Nothing filters on `period` today, which is precisely why the
         omission would go unnoticed until a settlement re-ran. */
      tx.set(
        db().doc(`leaderboard/current/entries/${input.uid}_${board}`),
        {
          uid: input.uid,
          username: str(user.username, 'member'),
          countryCode: str(user.countryCode, 'XX'),
          board,
          period: weekKey(),
          value: FieldValue.increment(1),
          tokens: FieldValue.increment(credited),
          finalRank: null,
          prizeTokens: 0,
          updatedAt: now(),
        },
        { merge: true },
      );
    }

    return {
      credited,
      balance: int(user.balance) + credited,
      claimId: claimRef.id,
      replayed: false,
    };
  });
}

/* ---- NOTIFICATIONS -------------------------------------------------------- */

export type NotificationIcon = 'checkCircle' | 'coins' | 'users' | 'flame' | 'ticket';
export type NotificationTone = 'success' | 'mint' | 'info' | 'warning' | 'violet';

export interface Notification {
  icon: NotificationIcon;
  tone: NotificationTone;
  title: string;
  body: string;
  href?: string | null;
}

/**
 * Best-effort by design. A notification is never worth failing the credit that
 * produced it, and a job that aborts a prize payout because one user's
 * subcollection write failed has made the outcome worse.
 */
export async function notify(uid: string, n: Notification): Promise<void> {
  try {
    await db().collection(`users/${uid}/notifications`).add({
      icon: n.icon,
      tone: n.tone,
      title: n.title,
      body: n.body,
      href: n.href ?? null,
      read: false,
      createdAt: now(),
      updatedAt: now(),
    });
  } catch (error) {
    console.error('[notify] write failed', { uid, error });
  }
}

/** The same document, shaped for a caller that already holds a batch. Used
    where the notification must land with the state change that justifies it. */
export function notificationDoc(n: Notification): Record<string, unknown> {
  return {
    icon: n.icon,
    tone: n.tone,
    title: n.title,
    body: n.body,
    href: n.href ?? null,
    read: false,
    createdAt: now(),
    updatedAt: now(),
  };
}

/* ---- AUDIT ----------------------------------------------------------------
   Shape copied from `../src/server/admin.ts#writeAudit` so the admin console's
   audit table renders rows from both writers without a special case. Scheduled
   jobs use `actorUid: 'system'`: an account that silently un-suspends itself is
   indistinguishable from one that was never suspended, and the ban-evasion
   investigation six weeks later needs the difference.
   ------------------------------------------------------------------------- */

export interface AuditRow {
  actorUid: string;
  actorName?: string;
  action: string;
  target: string;
  detail: string;
}

export const SYSTEM_ACTOR = 'system';

export function auditDoc(row: AuditRow): Record<string, unknown> {
  return {
    actorUid: row.actorUid,
    actorName: row.actorName ?? row.actorUid,
    action: row.action,
    target: row.target,
    detail: row.detail,
    createdAt: now(),
  };
}

/** A new `/auditLog` reference, for callers writing inside a batch. */
export const auditRef = () => db().collection('auditLog').doc();

export async function audit(row: AuditRow): Promise<void> {
  try {
    await auditRef().set(auditDoc(row));
  } catch (error) {
    /* Loud, not fatal. The state change has already happened; losing the audit
       row is a gap in the record, and hiding it is how the gap is discovered
       during an incident instead of before one. */
    console.error('[audit] write failed', { row, error });
  }
}
