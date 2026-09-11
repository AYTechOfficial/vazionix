import 'server-only';

import { cache } from 'react';

import type { CoinTicker, PayoutTickerRow, PlatformStats } from '@/lib/models';

import { getRates } from './config';
import { int, num } from './db';
import { rpcBumpStats } from './supabase';

/* ============================================================================
   PLATFORM STATISTICS
   ----------------------------------------------------------------------------
   The homepage numbers. COUNTERS, incremented inside the same DB call as the
   thing they count (public.bump_stats, migration 0019), not queries run at
   render time.

   WHY COUNTERS AND NOT COUNT QUERIES
   "How many claims have ever been made" as a query is a full-table scan over
   the largest table in the product, on the most-visited page. As a counter it
   is one row. The trade-off is that a counter can drift if a write path
   forgets to bump it — which is why every credit goes through
   `src/server/ledger.ts` and the bump lives inside that one function.

   TWO ROWS
     stats/global          lifetime totals
     stats/{YYYY-MM-DD}    today's slice, so "claims today" needs no range
                          query over a timestamp field

   `onlineNow` is the one genuine query: a count over users seen in the last
   five minutes. A stale "online now" is the one number nobody will accept
   being a counter.
   ========================================================================== */

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
  const entries = Object.entries(patch).filter(([, v]) => typeof v === 'number' && v !== 0);
  if (!entries.length) return;

  try {
    await rpcBumpStats(patch);
  } catch (error) {
    console.error('[stats] bump failed', error);
  }
}

/**
 * Live platform stats. Revalidated by the caller (the landing page uses
 * `revalidate = 60`), so a traffic spike does not turn the homepage into a
 * per-visitor database read.
 */
export const getPlatformStats = cache(async (): Promise<PlatformStats> => {
  try {
    const { supabaseGetStats, supabaseCountOnline } = await import('./data-supabase');
    const today = new Date().toISOString().slice(0, 10);
    const [global, todayRow, online] = await Promise.all([
      supabaseGetStats('global'),
      supabaseGetStats(today),
      supabaseCountOnline(5),
    ]);
    const g = global ?? {};
    const t = todayRow ?? {};
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
  } catch (error) {
    // Unconfigured Supabase (no keys set yet) means no counters; render zeroes
    // instead of crashing the most-visited page.
    console.error('[stats] platform stats failed', error);
    return {
      members: 0, membersToday: 0, claimsAllTime: 0, claimsToday: 0,
      tokensPaidAllTime: 0, paidOutUsd: 0, withdrawalsAllTime: 0, withdrawalsToday: 0,
      onlineNow: 0, updatedAt: new Date().toISOString(),
    };
  }
});

/**
 * The payout ticker on the landing and auth pages: real completed withdrawals,
 * newest first. Usernames are shown because the withdrawal is already public on
 * chain; addresses and amounts in USD are not exposed.
 */
export const getPayoutTicker = cache(async (limit = 12): Promise<PayoutTickerRow[]> => {
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
    console.error('[stats] daily series failed', error);
    return [];
  }
}

/** Total USD value currently held by users, for the admin treasury screen. */
export async function getLiabilityUsd(): Promise<{ tokens: number; usd: number }> {
  const [rates, dataMod] = await Promise.all([getRates(), import('./data-supabase')]);
  try {
    const global = (await dataMod.supabaseGetStats('global')) ?? {};
    const outstanding = int(global.tokens_credited) - int(global.tokens_withdrawn);
    return { tokens: outstanding, usd: outstanding * rates.usdPerToken };
  } catch (error) {
    console.error('[stats] liability read failed', error);
    return { tokens: 0, usd: 0 };
  }
}
