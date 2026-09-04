import 'server-only';

import { earningBonusBps, levelFromExp, withBonus } from '@/lib/config/economy';
import type { ClaimSource, LedgerEntry } from '@/lib/models';
import { isSupabaseBackend } from '@/lib/backend';

import { getEconomy } from './config';
import { rpcCredit, rpcDebit } from './supabase';
import {
  AppError,
  FieldValue,
  bool,
  conflict,
  dayKey,
  db,
  int,
  isoOr,
  now,
  str,
  weekKey,
} from './db';
import { bumpStat } from './stats';
import { pushNotification } from './users';

/* ============================================================================
   LEDGER — the only way tokens come into or leave existence
   ----------------------------------------------------------------------------
   Every earning path in the product calls `credit()`. Every debit calls
   `debit()`. Nothing else writes `balance`. That is not a style preference: it
   is what makes the invariant checkable.

   THE INVARIANT
     balance == sum(claims.amount) - sum(withdrawal token costs) + adjustments
   A balance change with no matching `/users/{uid}/claims` document is a bug by
   definition, so both writes happen in one transaction and neither can land
   alone.

   IDEMPOTENCY
   `idempotencyKey` becomes the claim document id. A replayed request — a double
   tap on Claim, an offerwall provider's routine duplicate postback, a retried
   fetch — hits `tx.create` on an id that already exists, throws, and is caught
   and reported as the original result. This is why the key must be derived from
   the ACTION, not from a random value: `faucet:{uid}:{windowStart}` replays
   safely, `crypto.randomUUID()` does not.

   INTEGER TOKENS
   Amounts are integers. The bonus is basis points, applied with
   `Math.floor`, so the house rounds down and no float ever touches a balance.

   SIDE EFFECTS INSIDE THE TRANSACTION
   Leaderboard score, claim counters, EXP, level and referral commission all
   move with the credit. Doing any of them afterwards means a crash between the
   two leaves a user paid but unranked, or a referrer owed a commission that
   never arrives.
   ========================================================================== */

export interface CreditInput {
  uid: string;
  source: ClaimSource;
  /** Base integer tokens, before the earning bonus. */
  amount: number;
  exp?: number;
  refId?: string | null;
  label: string;
  /** Deterministic id derived from the action. See the note above. */
  idempotencyKey?: string;
  /** Set false for prizes and adjustments that must not be uplifted. */
  applyBonus?: boolean;
  /** Set false to skip leaderboard scoring (adjustments, refunds). */
  score?: boolean;
  ip?: string | null;
  meta?: Record<string, unknown>;
}

export interface CreditResult {
  /** Tokens actually credited, after bonus. */
  credited: number;
  bonusBps: number;
  exp: number;
  balance: number;
  level: number;
  levelUp: boolean;
  claimId: string;
  /** True when this was a replay of an already-credited action. */
  replayed: boolean;
}

/** Which leaderboard a source scores on. Sources absent here do not score. */
const BOARD_FOR: Partial<Record<ClaimSource, string>> = {
  faucet: 'faucet',
  ptc: 'ptc',
  shortlink: 'shortlink',
  offerwall: 'offerwall',
  referral: 'referral',
};

/** Which claim counter a source increments. */
const COUNTER_FOR: Partial<Record<ClaimSource, string>> = {
  faucet: 'faucet',
  ptc: 'ptc',
  shortlink: 'shortlink',
  offerwall: 'offerwall',
  bonus: 'bonus',
  challenge: 'challenge',
};

export async function credit(input: CreditInput): Promise<CreditResult> {
  const economy = await getEconomy();

  /* Supabase backend: the DB-enforced Postgres function is authoritative. It
     performs the whole credit atomically and is replay-safe. */
  if (isSupabaseBackend) {
    // Need the resolved user's uuid for the rpc uid param; resolve from uid string.
    const res = await rpcCredit({
      userUuid: input.uid,
      source: input.source,
      amount: input.amount,
      exp: input.exp,
      refId: input.refId,
      label: input.label,
      idempotencyKey: input.idempotencyKey,
      applyBonus: input.applyBonus,
      score: input.score,
      ip: input.ip,
      meta: input.meta,
    });
    if (!res.ok) {
      switch (res.error) {
        case 'zero_amount': throw new AppError('Nothing to credit.', 400, 'zero_amount');
        case 'not_found': throw new AppError('Account not found.', 404, 'not_found');
        case 'suspended': throw new AppError(res.message ?? 'This account is suspended.', 403, 'suspended');
        default: throw new AppError(res.message ?? 'Could not credit.', 500, 'credit_failed');
      }
    }

    const result: CreditResult = {
      credited: res.credited ?? 0,
      bonusBps: res.bonusBps ?? 0,
      exp: res.exp ?? 0,
      balance: res.balance ?? 0,
      level: res.level ?? 1,
      levelUp: res.levelUp ?? false,
      claimId: res.claimId ?? String(res.balance ?? 0),
      replayed: res.replayed ?? false,
    };

    /* Post-commit work the Postgres function does not do: endpoint stats, the
       referrer commission (a second rpc credit), and the level-up toast. */
    if (!result.replayed) {
      void bumpStat({ claims: 1, tokensCredited: result.credited });
      if (res.referrerUid && res.commission) {
        try {
          await credit({
            uid: res.referrerUid,
            source: 'referral',
            amount: res.commission,
            label: 'Referral commission',
            refId: res.refRefId ?? null,
            idempotencyKey: `ref_${res.refRefId ?? res.claimId}`,
            applyBonus: false,
          });
        } catch (e) {
          console.error('[ledger] referral commission failed', e);
        }
      }
      if (result.levelUp) {
        await pushNotification(input.uid, {
          icon: 'checkCircle',
          tone: 'success',
          title: `Level ${result.level} reached`,
          body: 'Your earning bonus just went up. It applies to every claim from now on.',
          href: '/account',
        });
      }
    }
    return result;
  }

  const base = Math.max(0, Math.floor(input.amount));
  if (!base) throw new AppError('Nothing to credit.', 400, 'zero_amount');

  const userRef = db().doc(`users/${input.uid}`);
  const claimsCol = db().collection(`users/${input.uid}/claims`);
  const claimRef = input.idempotencyKey
    ? claimsCol.doc(input.idempotencyKey.replace(/\//g, '_').slice(0, 400))
    : claimsCol.doc();

  let referralPayout: { uid: string; amount: number; refId: string } | null = null;

  const result = await db().runTransaction<CreditResult>(async (tx) => {
    const [userSnap, claimSnap] = await Promise.all([tx.get(userRef), tx.get(claimRef)]);
    if (!userSnap.exists) throw new AppError('Account not found.', 404, 'not_found');

    const user = userSnap.data() as Record<string, unknown>;
    if (bool(user.suspended)) {
      throw new AppError(
        str(user.suspendedReason) || 'This account is suspended.',
        403,
        'suspended',
      );
    }

    /* ---- Replay: report the original credit, change nothing ---------------- */
    if (claimSnap.exists) {
      const prior = claimSnap.data() as Record<string, unknown>;
      const totalExp = int(user.totalExp, int(user.exp));
      const { level } = levelFromExp(totalExp, economy.levels);
      return {
        credited: int(prior.amount),
        bonusBps: int(prior.bonusBps),
        exp: int(prior.exp),
        balance: int(user.balance),
        level,
        levelUp: false,
        claimId: claimRef.id,
        replayed: true,
      };
    }

    const streak = int(user.streakDays);
    const priorTotalExp = int(user.totalExp, int(user.exp));
    const { level: priorLevel } = levelFromExp(priorTotalExp, economy.levels);

    const bonusBps = input.applyBonus === false
      ? 0
      : int(user.earningBonusBps, earningBonusBps(priorLevel, streak, economy.levels));

    const credited = input.applyBonus === false ? base : withBonus(base, bonusBps);
    const exp = Math.max(0, Math.floor(input.exp ?? 0));
    const nextTotalExp = priorTotalExp + exp;
    const { level: nextLevel, exp: levelExp } = levelFromExp(nextTotalExp, economy.levels);
    const levelUp = nextLevel > priorLevel;

    tx.create(claimRef, {
      source: input.source,
      amount: credited,
      baseAmount: base,
      exp,
      refId: input.refId ?? null,
      label: input.label,
      bonusBps,
      ip: input.ip ?? null,
      day: dayKey(),
      meta: input.meta ?? null,
      createdAt: now(),
      updatedAt: now(),
    });

    const update: Record<string, unknown> = {
      balance: FieldValue.increment(credited),
      totalEarned: FieldValue.increment(credited),
      totalExp: nextTotalExp,
      exp: levelExp,
      level: nextLevel,
      lastSeenAt: now(),
      updatedAt: now(),
    };

    if (levelUp) {
      update.earningBonusBps = earningBonusBps(nextLevel, streak, economy.levels);
    }

    const counter = COUNTER_FOR[input.source];
    if (counter) update[`claimCounts.${counter}`] = FieldValue.increment(1);

    tx.update(userRef, update);

    /* ---- Leaderboard score ------------------------------------------------ */
    const board = BOARD_FOR[input.source];
    if (board && input.score !== false) {
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

    /* ---- Referral commission ---------------------------------------------
       Queued rather than written here: paying it needs a second user document,
       and a transaction that reads a document it did not read first is a
       contention bug waiting to happen under load. It is credited immediately
       after commit, through this same function, so it gets its own ledger row
       and its own idempotency key. */
    const referrer = str(user.referredBy);
    if (referrer && input.source !== 'referral' && input.source !== 'adjustment') {
      const bps = int(user.commissionBps, 500);
      const commission = Math.floor((credited * bps) / 10_000);
      if (commission > 0) {
        referralPayout = {
          uid: referrer,
          amount: commission,
          refId: `${input.uid}:${claimRef.id}`,
        };
      }
    }

    return {
      credited,
      bonusBps,
      exp,
      balance: int(user.balance) + credited,
      level: nextLevel,
      levelUp,
      claimId: claimRef.id,
      replayed: false,
    };
  });

  if (result.replayed) return result;

  /* ---- Post-commit effects ------------------------------------------------ */

  await bumpStat({ claims: 1, tokensCredited: result.credited });

  if (referralPayout) {
    const payout = referralPayout as { uid: string; amount: number; refId: string };
    try {
      await credit({
        uid: payout.uid,
        source: 'referral',
        amount: payout.amount,
        label: 'Referral commission',
        refId: payout.refId,
        idempotencyKey: `ref_${payout.refId}`,
        applyBonus: false,
      });
      await db()
        .doc(`referrals/${payout.uid}/list/${input.uid}`)
        .set(
          {
            commissionPaid: FieldValue.increment(payout.amount),
            totalEarned: FieldValue.increment(result.credited),
            lastActiveAt: now(),
            updatedAt: now(),
          },
          { merge: true },
        );
    } catch (error) {
      // The user has been paid. A failed commission is reconciled by the
      // referral sweep, and must not roll back the earner's claim.
      console.error('[ledger] referral commission failed', error);
    }
  }

  if (result.levelUp) {
    await pushNotification(input.uid, {
      icon: 'checkCircle',
      tone: 'success',
      title: `Level ${result.level} reached`,
      body: 'Your earning bonus just went up. It applies to every claim from now on.',
      href: '/account',
    });
  }

  return result;
}

/* ---- DEBIT --------------------------------------------------------------- */

export interface DebitInput {
  uid: string;
  /** Positive integer tokens to remove. */
  amount: number;
  source: ClaimSource;
  label: string;
  refId?: string | null;
  idempotencyKey?: string;
  /** Move the tokens to `lockedBalance` instead of destroying them. */
  lock?: boolean;
}

export interface DebitResult {
  debited: number;
  balance: number;
  claimId: string;
  replayed: boolean;
}

export async function debit(input: DebitInput): Promise<DebitResult> {
  const amount = Math.max(0, Math.floor(input.amount));
  if (!amount) throw new AppError('Nothing to debit.', 400, 'zero_amount');

  /* Supabase backend: DB-posted, atomic, replay-safe. */
  if (isSupabaseBackend) {
    const res = await rpcDebit({
      userUuid: input.uid,
      amount,
      source: input.source,
      refId: input.refId,
      label: input.label,
      idempotencyKey: input.idempotencyKey,
      lock: input.lock,
    });
    if (!res.ok) {
      switch (res.error) {
        case 'zero_amount': throw new AppError('Nothing to debit.', 400, 'zero_amount');
        case 'not_found': throw new AppError('Account not found.', 404, 'not_found');
        case 'suspended': throw new AppError(res.message ?? 'This account is suspended.', 403, 'suspended');
        case 'insufficient_balance': throw conflict(
          `Not enough tokens. You have ${(res.balance ?? 0).toLocaleString('en-US')} and this needs ${amount.toLocaleString('en-US')}.`,
          'insufficient_balance',
        );
        default: throw new AppError(res.message ?? 'Could not debit.', 500, 'debit_failed');
      }
    }
    return {
      debited: res.debited ?? amount,
      balance: res.balance ?? 0,
      claimId: res.claimId ?? '',
      replayed: res.replayed ?? false,
    };
  }

  const userRef = db().doc(`users/${input.uid}`);
  const claimsCol = db().collection(`users/${input.uid}/claims`);
  const claimRef = input.idempotencyKey
    ? claimsCol.doc(input.idempotencyKey.replace(/\//g, '_').slice(0, 400))
    : claimsCol.doc();

  return db().runTransaction<DebitResult>(async (tx) => {
    const [userSnap, claimSnap] = await Promise.all([tx.get(userRef), tx.get(claimRef)]);
    if (!userSnap.exists) throw new AppError('Account not found.', 404, 'not_found');

    const user = userSnap.data() as Record<string, unknown>;
    if (bool(user.suspended)) throw new AppError('This account is suspended.', 403, 'suspended');

    if (claimSnap.exists) {
      return {
        debited: Math.abs(int(claimSnap.get('amount'))),
        balance: int(user.balance),
        claimId: claimRef.id,
        replayed: true,
      };
    }

    const balance = int(user.balance);
    if (balance < amount) {
      throw conflict(
        `Not enough tokens. You have ${balance.toLocaleString('en-US')} and this needs ${amount.toLocaleString('en-US')}.`,
        'insufficient_balance',
      );
    }

    tx.create(claimRef, {
      source: input.source,
      amount: -amount,
      baseAmount: -amount,
      exp: 0,
      refId: input.refId ?? null,
      label: input.label,
      bonusBps: 0,
      ip: null,
      day: dayKey(),
      createdAt: now(),
      updatedAt: now(),
    });

    tx.update(userRef, {
      balance: FieldValue.increment(-amount),
      ...(input.lock ? { lockedBalance: FieldValue.increment(amount) } : {}),
      lastSeenAt: now(),
      updatedAt: now(),
    });

    return { debited: amount, balance: balance - amount, claimId: claimRef.id, replayed: false };
  });
}

/* ---- READ ---------------------------------------------------------------- */

const SOURCE_LABEL: Record<string, string> = {
  faucet: 'Faucet claim',
  ptc: 'PTC view',
  shortlink: 'Shortlink',
  offerwall: 'Offerwall',
  bonus: 'Bonus',
  challenge: 'Challenge',
  referral: 'Referral commission',
  coupon: 'Coupon',
  lottery: 'Lottery',
  adjustment: 'Adjustment',
  withdrawal: 'Withdrawal',
  refund: 'Refund',
};

export interface LedgerPage {
  entries: LedgerEntry[];
  /** Cursor for the next page: the last entry's ISO timestamp. */
  cursor: string | null;
}

export async function listLedger(
  uid: string,
  options: { limit?: number; cursor?: string | null; source?: ClaimSource } = {},
): Promise<LedgerPage> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));

  let query = db()
    .collection(`users/${uid}/claims`)
    .orderBy('createdAt', 'desc')
    .limit(limit + 1);

  if (options.source) query = query.where('source', '==', options.source);
  if (options.cursor) {
    const at = new Date(options.cursor);
    if (!Number.isNaN(at.getTime())) query = query.startAfter(at);
  }

  const snap = await query.get();
  const docs = snap.docs.slice(0, limit);

  const entries: LedgerEntry[] = docs.map((doc) => {
    const data = doc.data();
    const source = str(data.source, 'bonus') as ClaimSource;
    return {
      id: doc.id,
      source,
      amount: int(data.amount),
      exp: int(data.exp),
      refId: data.refId ? str(data.refId) : null,
      label: str(data.label, SOURCE_LABEL[source] ?? 'Credit'),
      at: isoOr(data.createdAt),
    };
  });

  const last = entries[entries.length - 1];
  return {
    entries,
    cursor: snap.docs.length > limit && last ? last.at : null,
  };
}

/** Count of a user's claims for a source on the current UTC day — the cap check. */
export async function countToday(uid: string, source: ClaimSource): Promise<number> {
  if (isSupabaseBackend) {
    const { supabaseCountClaims } = await import('./data-supabase');
    return supabaseCountClaims(uid, source, dayKey());
  }
  const snap = await db()
    .collection(`users/${uid}/claims`)
    .where('source', '==', source)
    .where('day', '==', dayKey())
    .count()
    .get();
  return int(snap.data().count);
}

/** Last N days of per-source totals, for the dashboard earnings chart. */
export async function earningsByDay(
  uid: string,
  days = 14,
): Promise<Array<{ day: string; faucet: number; ptc: number; offerwall: number; bonus: number; challenge: number }>> {
  const since = new Date(Date.now() - days * 86400000);
  const snap = await db()
    .collection(`users/${uid}/claims`)
    .where('createdAt', '>=', since)
    .orderBy('createdAt', 'asc')
    .limit(3000)
    .get();

  const buckets = new Map<string, { faucet: number; ptc: number; offerwall: number; bonus: number; challenge: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 86400000));
    buckets.set(key, { faucet: 0, ptc: 0, offerwall: 0, bonus: 0, challenge: 0 });
  }

  for (const doc of snap.docs) {
    const data = doc.data();
    const key = str(data.day, isoOr(data.createdAt).slice(0, 10));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const amount = int(data.amount);
    if (amount <= 0) continue;

    switch (str(data.source)) {
      case 'faucet': bucket.faucet += amount; break;
      case 'ptc': bucket.ptc += amount; break;
      case 'offerwall': bucket.offerwall += amount; break;
      case 'shortlink': bucket.offerwall += amount; break;
      case 'challenge': bucket.challenge += amount; break;
      default: bucket.bonus += amount; break;
    }
  }

  return [...buckets.entries()].map(([day, v]) => ({ day, ...v }));
}
