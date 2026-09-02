/* ============================================================================
   ECONOMY CONFIGURATION — a deliberate copy
   ----------------------------------------------------------------------------
   KEEP THIS IN STEP WITH `../src/lib/config/economy.ts`.

   `functions/` is a separate TypeScript project. It has its own tsconfig, its
   own dependency tree, and it is deployed as its own bundle, so it cannot
   import from the Next.js app — a relative import into `../src` would compile
   locally and then fail at deploy time because `../src` is not uploaded with
   the functions source. The values below are therefore copied, not shared.

   Only the keys the jobs in this bundle actually read are copied. If you change
   a payout curve, a prize pool, a tier table or a bonus rate in the web app,
   change it here in the same commit. The two are asserted against each other
   nowhere: this comment is the only thing keeping them honest, which is why the
   numbers that matter for money are also read from `/config/economy` at run
   time and these are only the floor.

   THE MERGE RULE, same as `../src/server/config.ts`
   A Firestore document at `/config/economy` is merged OVER these defaults, key
   by key, so a partial document overrides only what it sets. That is what lets
   an operator change one cooldown from the admin console without having to
   re-state the whole economy, and what lets a brand-new project run before
   anyone has opened the console at all.
   ========================================================================== */

import { db, num } from './core';

export type CoinTicker =
  | 'BTC' | 'LTC' | 'TRX' | 'SOL' | 'DOGE' | 'USDT'
  | 'TON' | 'PEPE' | 'SHIB' | 'FLOKI' | 'BONK' | 'BNB';

export type ReferralTierName = 'Bronze' | 'Silver' | 'Gold' | 'Elite';

export type PayoutRailName = 'FaucetPay' | 'CWallet' | 'Direct';

export type ClaimSource =
  | 'faucet' | 'ptc' | 'shortlink' | 'offerwall' | 'bonus' | 'challenge'
  | 'referral' | 'coupon' | 'lottery' | 'adjustment' | 'withdrawal' | 'refund';

export type LeaderboardBoardId = 'faucet' | 'ptc' | 'shortlink' | 'offerwall' | 'referral';

/** The five boards, in the order the UI renders them. */
export const BOARDS: readonly LeaderboardBoardId[] = [
  'faucet',
  'ptc',
  'shortlink',
  'offerwall',
  'referral',
];

export interface LevelConfig {
  base: number;
  growth: number;
  bonusBpsPerLevel: number;
  bonusBpsPerStreakDay: number;
  maxBonusBps: number;
}

export interface ReferralConfig {
  tiers: Array<{ name: ReferralTierName; at: number; rate: number; perk: string }>;
  qualifyingLevel: number;
  qualifyBonusTokens: number;
  signupBonusTokens: number;
}

export interface DailyBonusConfig {
  cooldownHours: number;
  /** Hours of inactivity after which the streak is dead. `sweepStreaks` reads it. */
  breakAfterHours: number;
}

export interface LotteryConfig {
  ticketPriceTokens: number;
  maxTicketsPerUserPerRound: number;
  winnersPerDraw: number;
  payoutBps: number;
  /** Day of week (0 = Sunday) and UTC hour of the draw. */
  drawDayUtc: number;
  drawHourUtc: number;
  seedPool: number;
}

export interface LeaderboardConfig {
  prizePoolPerBoard: number;
  /** Share of the board pool by finishing position, in basis points. */
  payoutCurveBps: number[];
  /** Rows stored and ranked per board. */
  size: number;
}

export interface WithdrawConfig {
  minBalanceTokens: number;
  reviewThresholdUsd: number;
  dailyCount: number;
  quoteTtlSeconds: number;
  requireEmailVerified: boolean;
  minAccountAgeHours: number;
}

export interface EconomyConfig {
  daily: DailyBonusConfig;
  referrals: ReferralConfig;
  levels: LevelConfig;
  lottery: LotteryConfig;
  withdraw: WithdrawConfig;
  leaderboard: LeaderboardConfig;
  usdPerToken: number;
}

export const DEFAULT_ECONOMY: EconomyConfig = {
  daily: { cooldownHours: 20, breakAfterHours: 48 },
  referrals: {
    tiers: [
      { name: 'Bronze', at: 0, rate: 5, perk: 'Lifetime 5% of referral earnings' },
      { name: 'Silver', at: 5, rate: 10, perk: '10% commission + weekly referral board entry' },
      { name: 'Gold', at: 25, rate: 12, perk: '12% commission + priority support queue' },
      { name: 'Elite', at: 100, rate: 15, perk: '15% commission + custom referral landing' },
    ],
    qualifyingLevel: 1,
    qualifyBonusTokens: 250,
    signupBonusTokens: 100,
  },
  levels: {
    base: 100,
    growth: 1.18,
    bonusBpsPerLevel: 20,
    bonusBpsPerStreakDay: 10,
    maxBonusBps: 1500,
  },
  lottery: {
    ticketPriceTokens: 500,
    maxTicketsPerUserPerRound: 50,
    winnersPerDraw: 10,
    payoutBps: 8000,
    drawDayUtc: 0,
    drawHourUtc: 0,
    seedPool: 100000,
  },
  withdraw: {
    minBalanceTokens: 1000,
    reviewThresholdUsd: 25,
    dailyCount: 5,
    quoteTtlSeconds: 300,
    requireEmailVerified: true,
    minAccountAgeHours: 24,
  },
  leaderboard: {
    prizePoolPerBoard: 250000,
    payoutCurveBps: [2500, 1600, 1100, 800, 700, 600, 500, 450, 400, 350],
    size: 100,
  },
  usdPerToken: 0.0000098,
};

/** Indicative spot prices. `refreshRates` replaces the ones it can price and
    leaves the rest alone, so a provider outage degrades to the last good value
    rather than to zero. */
export const DEFAULT_SPOT: Record<CoinTicker, number> = {
  BTC: 95000, LTC: 95, TRX: 0.26, SOL: 150, DOGE: 0.16, USDT: 1,
  TON: 3.5, PEPE: 0.0000095, SHIB: 0.0000135, FLOKI: 0.00012, BONK: 0.000022, BNB: 620,
};

/* ---- DERIVED MATHS -------------------------------------------------------
   Copied from `../src/lib/config/economy.ts` for the same reason as the values
   above. These decide what a level and a streak are worth, so the copy has to
   be exact: if this file computes a different bonus from the one the web app
   showed the user before the claim, the ledger row disagrees with the UI that
   produced it.
   ------------------------------------------------------------------------- */

/** EXP required to complete `level`. */
export function expForLevel(level: number, cfg: LevelConfig): number {
  return Math.round(cfg.base * Math.pow(cfg.growth, Math.max(0, level - 1)));
}

/** Lifetime EXP → level, progress into the level, and the next threshold. */
export function levelFromExp(
  totalExp: number,
  cfg: LevelConfig,
): { level: number; exp: number; expNext: number } {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalExp));
  let need = expForLevel(level, cfg);

  while (remaining >= need && level < 500) {
    remaining -= need;
    level += 1;
    need = expForLevel(level, cfg);
  }

  return { level, exp: remaining, expNext: need };
}

/** Combined earning bonus in basis points. `sweepStreaks` recomputes with a
    streak of zero, which is the whole point of the sweep. */
export function earningBonusBps(level: number, streakDays: number, cfg: LevelConfig): number {
  const raw = level * cfg.bonusBpsPerLevel + streakDays * cfg.bonusBpsPerStreakDay;
  return Math.min(cfg.maxBonusBps, raw);
}

/** Apply a basis-point bonus to an integer token amount. Rounds DOWN, so the
    house never pays a fraction of a token it did not mean to. */
export function withBonus(amount: number, bonusBps: number): number {
  return Math.floor(amount * (1 + bonusBps / 10_000));
}

/** Tier from the qualified-referral count. Computed from the count rather than
    incremented, because a count can be recomputed and an increment can drift. */
export function tierForCount(
  qualified: number,
  cfg: ReferralConfig,
): { tier: ReferralTierName; rate: number } {
  const sorted = [...cfg.tiers].sort((a, b) => a.at - b.at);
  let current = sorted[0] ?? { name: 'Bronze' as ReferralTierName, at: 0, rate: 5, perk: '' };
  for (const tier of sorted) if (qualified >= tier.at) current = tier;
  return { tier: current.name, rate: current.rate };
}

/* ---- READ ----------------------------------------------------------------- */

function merge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    const current = out[key];
    if (
      current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      out[key] = merge(current, value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * The live economy: `/config/economy` merged over the defaults above.
 *
 * A failed read falls back to the defaults rather than raising. A scheduled job
 * that refuses to run because one config document was briefly unreadable is a
 * job that skips a week of prize payouts, and the defaults are the values the
 * product shipped with — not zeros.
 */
export async function readEconomy(): Promise<EconomyConfig> {
  try {
    const snap = await db().doc('config/economy').get();
    return snap.exists ? merge(DEFAULT_ECONOMY, snap.data()) : DEFAULT_ECONOMY;
  } catch (error) {
    console.error('[config] economy read failed, using shipped defaults', error);
    return DEFAULT_ECONOMY;
  }
}

/** Operator-owned switches from `/config/site`. Read by the payout batch, which
    must not move money while withdrawals are paused. */
export interface SiteFlags {
  withdrawalsOpen: boolean;
  earningOpen: boolean;
  maintenance: boolean;
}

export async function readSiteFlags(): Promise<SiteFlags> {
  try {
    const snap = await db().doc('config/site').get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    return {
      withdrawalsOpen: data.withdrawalsOpen !== false,
      earningOpen: data.earningOpen !== false,
      maintenance: data.maintenance === true,
    };
  } catch (error) {
    /* Unreadable flags are treated as "paused" for money movement only. The
       batch job asks this question; refusing to pay is recoverable, paying
       during a declared incident is not. */
    console.error('[config] site flags read failed, assuming paused', error);
    return { withdrawalsOpen: false, earningOpen: false, maintenance: true };
  }
}

/** True while the break-glass lockdown is engaged. Checked by the payout batch
    so a lockdown declared at 02:00 does not still let the 06:00 batch run. */
export async function isLockedDown(): Promise<boolean> {
  try {
    const snap = await db().doc('platformConfig/abuse').get();
    return snap.exists && snap.get('lockdown') === true;
  } catch (error) {
    console.error('[config] lockdown read failed, assuming engaged', error);
    return true;
  }
}

/** USD per token, for the batch's operator-facing totals. Never used to price a
    payout here: pricing happens in the Route Handler that quoted it. */
export async function readUsdPerToken(): Promise<number> {
  try {
    const [rates, economy] = await Promise.all([db().doc('config/rates').get(), readEconomy()]);
    const remote = rates.exists ? num(rates.get('usdPerToken')) : 0;
    return remote > 0 ? remote : economy.usdPerToken;
  } catch {
    return DEFAULT_ECONOMY.usdPerToken;
  }
}
