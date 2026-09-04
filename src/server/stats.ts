import 'server-only';

import { cache } from 'react';

import type { CoinTicker, PayoutTickerRow, PlatformStats } from '@/lib/models';
import { isSupabaseBackend } from '@/lib/backend';

import { getRates } from './config';
import { FieldValue, dayKey, db, int, iso, isServerFirebaseReady, now, num, str } from './db';

/* ============================================================================
   PLATFORM STATISTICS
   ----------------------------------------------------------------------------
   The homepage numbers. These are COUNTERS, incremented inside the same
   transaction as the thing they count, not queries run at render time.

   WHY COUNTERS AND NOT COUNT QUERIES
   "How many claims have ever been made" as a query is a full collection scan
   over the largest collection in the product, on the most-visited page. As a
   counter it is one document read. The trade-off is that a counter can drift if
   a write path forgets to bump it — which is why every credit goes through
   `src/server/ledger.ts` and the bump lives inside that one function.

   TWO DOCUMENTS
     /stats/global        lifetime totals
     /stats/daily/{YYYY-MM-DD}  today's slice, so "claims today" needs no range
                                query over a timestamp field

   `onlineNow` is the one genuine query: a count() aggregate over users seen in
   the last five minutes. Aggregates bill one read per 1000 documents matched,
   so it stays cheap, and a stale "online now" is the one number nobody will
   accept being a counter.
   ========================================================================== */

const GLOBAL = 'stats/global';

export interface StatPatch {
  members?: number;
  membersToday?: number;
  claims?: number;
  tokensCredited?: number;
  withdrawals?: number;
  tokensWithdrawn?: number;
  usdWithdrawn?: number;
  ptcViews?: number;
  shortlinkClaims?: number;
  offerwallConversions?: number;
  adImpressions?: number;
}

/**
 * Increment lifetime and today's counters. Fire-and-forget by design: a stats
 * write must never fail the claim that produced it. A dropped increment is a
 * cosmetic drift; a failed claim is a support ticket.
 */
export async function bumpStat(patch: StatPatch): Promise<void> {
  if (!isServerFirebaseReady()) return;

  const entries = Object.entries(patch).filter(([, v]) => typeof v === 'number' && v !== 0);
  if (!entries.length) return;

  const increments: Record<string, unknown> = { updatedAt: now() };
  for (const [key, value] of entries) increments[key] = FieldValue.increment(value as number);

  const today = { ...increments, day: dayKey() };

  try {
    await Promise.all([
      db().doc(GLOBAL).set(increments, { merge: true }),
      db().doc(`stats/daily/days/${dayKey()}`).set(today, { merge: true }),
    ]);
  } catch (error) {
    console.error('[stats] bump failed', error);
  }
}

async function readCounters(path: string): Promise<Record<string, unknown>> {
  if (!isServerFirebaseReady()) return {};
  try {
    const snap = await db().doc(path).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function countOnline(): Promise<number> {
  if (!isServerFirebaseReady()) return 0;
  try {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    const snap = await db()
      .collection('users')
      .where('lastSeenAt', '>=', cutoff)
      .count()
      .get();
    return int(snap.data().count);
  } catch {
    return 0;
  }
}

/**
 * Live platform stats. Revalidated by the caller (the landing page uses
 * `revalidate = 60`), so a traffic spike does not turn the homepage into a
 * per-visitor Firestore read.
 */
export const getPlatformStats = cache(async (): Promise<PlatformStats> => {
  if (isSupabaseBackend) {
    const { supabaseGetStats, supabaseCountOnline } = await import('./data-supabase');
    const [global, today, online] = await Promise.all([
      supabaseGetStats('global'),
      supabaseGetStats(dayKey()),
      supabaseCountOnline(5),
    ]);
    const g = global ?? {};
    const t = today ?? {};
    return {
      members: num(g.members),
      membersToday: num(t.members_today),
      claimsAllTime: num(g.claims),
      claimsToday: num(t.claims),
      tokensPaidAllTime: num(g.tokens_credited),
      paidOutUsd: num(g.usd_withdrawn),
      withdrawalsAllTime: num(g.withdrawals),
      withdrawalsToday: num(t.withdrawals),
      onlineNow: online,
      updatedAt: g.updated_at ? new Date(g.updated_at as string).toISOString() : new Date().toISOString(),
    };
  }

  const [global, today, online] = await Promise.all([
    readCounters(GLOBAL),
    readCounters(`stats/daily/days/${dayKey()}`),
    countOnline(),
  ]);

  return {
    members: int(global.members),
    membersToday: int(today.membersToday),
    claimsAllTime: int(global.claims),
    claimsToday: int(today.claims),
    tokensPaidAllTime: int(global.tokensCredited),
    paidOutUsd: num(global.usdWithdrawn),
    withdrawalsAllTime: int(global.withdrawals),
    withdrawalsToday: int(today.withdrawals),
    onlineNow: online,
    updatedAt: iso(global.updatedAt) ?? new Date().toISOString(),
  };
});

/**
 * The payout ticker on the landing and auth pages: real completed withdrawals,
 * newest first. Usernames are shown because the withdrawal is already public on
 * chain; addresses and amounts in USD are not exposed.
 */
export const getPayoutTicker = cache(async (limit = 12): Promise<PayoutTickerRow[]> => {
  if (isSupabaseBackend) {
    const { supabaseGetCompletedWithdrawals } = await import('./data-supabase');
    try {
      const rows = await supabaseGetCompletedWithdrawals(limit);
      return rows.map((d) => {
        const u = typeof d.username === 'string' ? d.username : 'member';
        return {
          username: u,
          countryCode: String(d.country_code ?? 'XX'),
          amount: String(d.receive_amount ?? d.amount ?? '0'),
          coin: (String(d.coin ?? 'USDT') as CoinTicker),
          at: d.processed_at ? new Date(d.processed_at as string).toISOString()
             : d.created_at ? new Date(d.created_at as string).toISOString()
             : new Date().toISOString(),
        };
      });
    } catch (error) {
      console.error('[stats] supabase payout ticker failed', error);
      return [];
    }
  }
  if (!isServerFirebaseReady()) return [];
  try {
    const snap = await db()
      .collection('withdrawals')
      .where('status', '==', 'Completed')
      .orderBy('processedAt', 'desc')
      .limit(limit)
      .get();

    return snap.docs.map((doc) => {
      const data = doc.data();
      return {
        username: str(data.username, 'member'),
        countryCode: str(data.countryCode, 'XX'),
        amount: str(data.receiveAmount, str(data.amount, '0')),
        coin: (str(data.coin, 'USDT') as CoinTicker),
        at: iso(data.processedAt) ?? iso(data.createdAt) ?? new Date().toISOString(),
      };
    });
  } catch (error) {
    console.error('[stats] payout ticker failed', error);
    return [];
  }
});

/**
 * Daily series for the admin revenue and engagement charts, and for the
 * dashboard earnings chart's platform comparison line.
 */
export interface DailyStatRow {
  day: string;
  members: number;
  claims: number;
  tokensCredited: number;
  withdrawals: number;
  usdWithdrawn: number;
  adImpressions: number;
  ptcViews: number;
  shortlinkClaims: number;
  offerwallConversions: number;
}

export async function getDailySeries(days = 30): Promise<DailyStatRow[]> {
  if (isSupabaseBackend) {
    const { supabaseGetDailyStats } = await import('./data-supabase');
    try {
      const rows = await supabaseGetDailyStats(days);
      return rows.map((d) => ({
        day: String(d.day ?? ''),
        members: num(d.members_today),
        claims: num(d.claims),
        tokensCredited: num(d.tokens_credited),
        withdrawals: num(d.withdrawals),
        usdWithdrawn: num(d.usd_withdrawn),
        adImpressions: num(d.ad_impressions),
        ptcViews: num(d.ptc_views),
        shortlinkClaims: num(d.shortlink_claims),
        offerwallConversions: num(d.offerwall_conversions),
      }));
    } catch (error) {
      console.error('[stats] supabase daily series failed', error);
      return [];
    }
  }
  if (!isServerFirebaseReady()) return [];
  try {
    const snap = await db()
      .collection('stats/daily/days')
      .orderBy('day', 'desc')
      .limit(days)
      .get();

    return snap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          day: str(data.day, doc.id),
          members: int(data.membersToday),
          claims: int(data.claims),
          tokensCredited: int(data.tokensCredited),
          withdrawals: int(data.withdrawals),
          usdWithdrawn: num(data.usdWithdrawn),
          adImpressions: int(data.adImpressions),
          ptcViews: int(data.ptcViews),
          shortlinkClaims: int(data.shortlinkClaims),
          offerwallConversions: int(data.offerwallConversions),
        };
      })
      .reverse();
  } catch (error) {
    console.error('[stats] daily series failed', error);
    return [];
  }
}

/** Total USD value currently held by users, for the admin treasury screen. */
export async function getLiabilityUsd(): Promise<{ tokens: number; usd: number }> {
  const [global, rates] = await Promise.all([readCounters(GLOBAL), getRates()]);
  const outstanding = int(global.tokensCredited) - int(global.tokensWithdrawn);
  return { tokens: outstanding, usd: outstanding * rates.usdPerToken };
}
