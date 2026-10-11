import 'server-only';

import type { ClaimSource, LedgerEntry } from '@/lib/models';

import { rpcCredit, rpcDebit } from './supabase';
import { AppError, conflict, dayKey } from './db';
import { bumpStat } from './stats';
import { pushNotification } from './users';

/* ============================================================================
   LEDGER — the only way tokens come into or leave existence
   ----------------------------------------------------------------------------
   Every earning path in the product calls `credit()`. Every debit calls
   `debit()`. Nothing else writes `balance`. The Postgres functions
   public.credit / public.debit perform the whole change atomically under a row
   lock and are replay-safe through the (user_id, client_request_id) unique
   index, so the DB — not this process — enforces the invariant:

     balance == sum(claims.amount) - sum(withdrawal token costs) + adjustments

   IDEMPOTENCY
   `idempotencyKey` becomes the claim's client_request_id. A replayed request —
   a double tap on Claim, an offerwall provider's routine duplicate postback, a
   retried fetch — finds the existing row and is reported as the original
   result. This is why the key must be derived from the ACTION, not from a
   random value: `faucet:{uid}:{windowStart}` replays safely,
   `crypto.randomUUID()` does not.

   INTEGER TOKENS
   Amounts are integers. The bonus is basis points, applied by the SQL with
   floor(), so the house rounds down and no float ever touches a balance.
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

export async function credit(input: CreditInput): Promise<CreditResult> {
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
    bonusBps: res.bonusBps ?? res.bonus_bps ?? 0,
    exp: res.exp ?? 0,
    balance: res.balance ?? 0,
    level: res.level ?? 1,
    levelUp: res.levelUp ?? res.level_up ?? false,
    claimId: String(res.claimId ?? res.claim_id ?? res.balance ?? 0),
    replayed: res.replayed ?? false,
  };

  /* Post-commit work the Postgres function deliberately does not do: the stats
     counters, the referrer's commission (a second credit with its own
     idempotency key, so a failure never rolls back the earner) and the level-up
     toast. */
  if (!result.replayed) {
    void bumpStat({ claims: 1, tokensCredited: result.credited });

    const referrerUid = res.referrerUid ?? res.referrer_uid;
    const commission = res.commission ?? 0;
    if (referrerUid && commission > 0) {
      try {
        await credit({
          uid: referrerUid,
          source: 'referral',
          amount: commission,
          label: 'Referral commission',
          refId: res.refRefId ?? res.ref_ref_id ?? null,
          idempotencyKey: `ref_${res.refRefId ?? res.ref_ref_id ?? result.claimId}`,
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

export async function debit(input: DebitInput): Promise<DebitResult> {
  const amount = Math.max(0, Math.floor(input.amount));
  if (!amount) throw new AppError('Nothing to debit.', 400, 'zero_amount');

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
    claimId: String(res.claimId ?? res.claim_id ?? ''),
    replayed: res.replayed ?? false,
  };
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

  const { supabaseListClaims } = await import('./data-supabase');
  const rows = await supabaseListClaims(uid, {
    limit,
    source: options.source ?? null,
    cursorIso: options.cursor ?? null,
  });
  const hasMore = rows.length > limit;
  const docs = rows.slice(0, limit);
  const entries: LedgerEntry[] = docs.map((d: Record<string, unknown>) => ({
    id: String(d.id ?? ''),
    source: (d.source ?? 'bonus') as ClaimSource,
    amount: Number(d.amount ?? 0),
    exp: Number(d.exp ?? 0),
    refId: d.ref_id ? String(d.ref_id) : null,
    label: d.label ? String(d.label) : SOURCE_LABEL[String(d.source ?? 'bonus') as ClaimSource] ?? 'Credit',
    at: d.created_at ? new Date(String(d.created_at)).toISOString() : new Date().toISOString(),
  }));
  const last = entries[entries.length - 1];
  return { entries, cursor: hasMore && last ? last.at : null };
}

/** Count of a user's claims for a source on the current UTC day — the cap check. */
export async function countToday(uid: string, source: ClaimSource): Promise<number> {
  const { supabaseCountClaims } = await import('./data-supabase');
  return supabaseCountClaims(uid, source, dayKey());
}

/** Last N days of per-source totals, for the dashboard earnings chart. */
export async function earningsByDay(
  uid: string,
  days = 14,
): Promise<Array<{ day: string; faucet: number; ptc: number; offerwall: number; bonus: number; challenge: number }>> {
  const daysN = Math.max(1, Math.min(90, days));
  const buckets = new Map<string, { faucet: number; ptc: number; offerwall: number; bonus: number; challenge: number }>();
  for (let i = daysN - 1; i >= 0; i--) {
    buckets.set(dayKey(new Date(Date.now() - i * 86400000)), { faucet: 0, ptc: 0, offerwall: 0, bonus: 0, challenge: 0 });
  }

  const { supabaseEarningsByDay } = await import('./data-supabase');
  const rows = await supabaseEarningsByDay(uid, daysN);
  for (const r of rows) {
    const key = r.day ? String(r.day) : (r.created_at ? new Date(String(r.created_at)).toISOString().slice(0, 10) : '');
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const amount = Number(r.amount ?? 0);
    if (amount <= 0) continue;
    switch (String(r.source)) {
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
