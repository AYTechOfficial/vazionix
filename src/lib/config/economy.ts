/* ============================================================================
   ECONOMY CONFIGURATION
   ----------------------------------------------------------------------------
   Every number that decides what a user earns lives here as a typed default,
   and every one of them is overridable from Firestore `/config/economy` through
   Admin → Modules. Two reasons for the pair:

   • The app has to run against an empty database. A fresh Firebase project has
     no /config document, and a faucet that pays nothing until you seed it looks
     broken rather than unconfigured.
   • Changing a payout must not need a deploy. Rewards, cooldowns and caps are
     operational levers pulled during a traffic spike, not code.

   Firestore values are merged over these on read (`src/server/config.ts`), so a
   partial document only overrides the keys it actually sets.
   ========================================================================== */

import type { CoinTicker, PayoutRailName, ReferralTierName } from '@/lib/models';

export interface FaucetConfig {
  /** Integer tokens per claim, before bonuses. */
  reward: number;
  exp: number;
  cooldownSeconds: number;
  /** Max claims per UTC day. */
  dailyCap: number;
  /** Percent uplift during the happy-hour window. */
  happyHourBonusPct: number;
  /** UTC hours at which a happy hour starts. Empty disables the feature. */
  happyHourStartHoursUtc: number[];
  happyHourLengthMinutes: number;
  requireCaptcha: boolean;
}

export interface PtcConfig {
  /** Extra seconds a viewer may take before the view is void. */
  graceSeconds: number;
  exp: number;
  dailyCap: number;
  requireCaptcha: boolean;
}

export interface ShortlinkConfig {
  exp: number;
  dailyCap: number;
  /** Seconds a shortlink token stays valid once issued. */
  tokenTtlSeconds: number;
  requireCaptcha: boolean;
}

export interface DailyBonusConfig {
  steps: Array<{ tokens: number; exp: number; bonus: number }>;
  /** Hours after a claim before the next one unlocks. */
  cooldownHours: number;
  /** Hours of inactivity that reset the ladder to step 1. */
  breakAfterHours: number;
}

export interface ReferralConfig {
  tiers: Array<{ name: ReferralTierName; at: number; rate: number; perk: string }>;
  /** A referral counts toward a tier only at or above this level. */
  qualifyingLevel: number;
  /** One-off bonus to the referrer when a referral qualifies. */
  qualifyBonusTokens: number;
  /** One-off bonus to the new user on signup. */
  signupBonusTokens: number;
}

export interface LevelConfig {
  /** EXP needed for level 1. */
  base: number;
  /** Multiplier applied per level. */
  growth: number;
  /** Earning bonus in basis points granted per level. */
  bonusBpsPerLevel: number;
  /** Earning bonus in basis points granted per consecutive streak day. */
  bonusBpsPerStreakDay: number;
  /** Hard ceiling on the combined bonus, in basis points. */
  maxBonusBps: number;
}

export interface LotteryConfig {
  ticketPriceTokens: number;
  maxTicketsPerUserPerRound: number;
  winnersPerDraw: number;
  /** Share of the pool paid out each draw, in basis points. */
  payoutBps: number;
  /** Day of week (0 = Sunday) and UTC hour of the draw. */
  drawDayUtc: number;
  drawHourUtc: number;
  /** Tokens seeded into an empty pool so the first round is not zero. */
  seedPool: number;
}

export interface WithdrawConfig {
  /** Minimum spendable balance before withdrawing is allowed at all. */
  minBalanceTokens: number;
  /** Withdrawals above this USD value are held for manual review. */
  reviewThresholdUsd: number;
  /** Max withdrawals per UTC day, per user. */
  dailyCount: number;
  /** Seconds a quote stays honourable. */
  quoteTtlSeconds: number;
  requireEmailVerified: boolean;
  /** Account age in hours before the first withdrawal. */
  minAccountAgeHours: number;
}

export interface LeaderboardConfig {
  /** Prize pool in tokens, per board, per period. */
  prizePoolPerBoard: number;
  /** Share of the board pool by finishing position, in basis points. */
  payoutCurveBps: number[];
  /** Rows stored and shown per board. */
  size: number;
}

export interface EconomyConfig {
  faucet: FaucetConfig;
  ptc: PtcConfig;
  shortlinks: ShortlinkConfig;
  daily: DailyBonusConfig;
  referrals: ReferralConfig;
  levels: LevelConfig;
  lottery: LotteryConfig;
  withdraw: WithdrawConfig;
  leaderboard: LeaderboardConfig;
  /** USD value of one internal token. Overridden by /config/rates. */
  usdPerToken: number;
}

export const DEFAULT_ECONOMY: EconomyConfig = {
  faucet: {
    reward: 65,
    exp: 3,
    cooldownSeconds: 34 * 60,
    dailyCap: 1000,
    happyHourBonusPct: 10,
    happyHourStartHoursUtc: [0, 6, 12, 18],
    happyHourLengthMinutes: 60,
    requireCaptcha: true,
  },
  ptc: { graceSeconds: 20, exp: 2, dailyCap: 200, requireCaptcha: false },
  shortlinks: { exp: 5, dailyCap: 300, tokenTtlSeconds: 900, requireCaptcha: true },
  daily: {
    steps: [
      { tokens: 30, exp: 2, bonus: 0.3 },
      { tokens: 35, exp: 5, bonus: 0.5 },
      { tokens: 40, exp: 7, bonus: 0.7 },
      { tokens: 45, exp: 9, bonus: 1.0 },
      { tokens: 50, exp: 11, bonus: 1.5 },
      { tokens: 55, exp: 13, bonus: 2.5 },
      { tokens: 60, exp: 15, bonus: 2.7 },
      { tokens: 65, exp: 18, bonus: 3.0 },
    ],
    cooldownHours: 20,
    breakAfterHours: 48,
  },
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

/* ---- DERIVED HELPERS -------------------------------------------------------
   Pure functions over the config, shared by the server (to award) and the UI
   (to display the same numbers before the award happens). Duplicating this
   maths on the client is how a progress bar ends up disagreeing with a level
   up.                                                                      */

/** Total EXP required to complete `level`. */
export function expForLevel(level: number, cfg: LevelConfig): number {
  return Math.round(cfg.base * Math.pow(cfg.growth, Math.max(0, level - 1)));
}

/** Split a lifetime EXP total into level, progress and next threshold. */
export function levelFromExp(totalExp: number, cfg: LevelConfig): {
  level: number;
  exp: number;
  expNext: number;
} {
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

/** Combined earning bonus, in basis points, from level and streak. */
export function earningBonusBps(level: number, streakDays: number, cfg: LevelConfig): number {
  const raw = level * cfg.bonusBpsPerLevel + streakDays * cfg.bonusBpsPerStreakDay;
  return Math.min(cfg.maxBonusBps, raw);
}

/** Apply a basis-point bonus to an integer token amount, rounding down. */
export function withBonus(amount: number, bonusBps: number): number {
  return Math.floor(amount * (1 + bonusBps / 10_000));
}

export function tierForCount(qualified: number, cfg: ReferralConfig): {
  tier: ReferralTierName;
  rate: number;
  next: ReferralConfig['tiers'][number] | null;
} {
  const sorted = [...cfg.tiers].sort((a, b) => a.at - b.at);
  let current = sorted[0]!;
  for (const tier of sorted) if (qualified >= tier.at) current = tier;
  const next = sorted.find((t) => t.at > qualified) ?? null;
  return { tier: current.name, rate: current.rate, next };
}

/* ---- PAYOUT RAILS ----------------------------------------------------------
   Defaults only. `/config/rates` replaces this wholesale once the pricing job
   runs, and Admin → Rails edits it. Amounts are decimal strings because an
   8-decimal asset in a float is a rounding bug waiting for a support ticket. */

export interface RailDefault {
  coin: CoinTicker;
  rail: PayoutRailName;
  network: string;
  min: string;
  fee: string;
  etaLabel: string;
  enabled: boolean;
}

export const DEFAULT_RAILS: RailDefault[] = [
  { coin: 'USDT', rail: 'FaucetPay', network: 'FaucetPay', min: '0.010000', fee: '0.000000', etaLabel: 'Under a minute', enabled: true },
  { coin: 'BTC', rail: 'FaucetPay', network: 'FaucetPay', min: '0.00000500', fee: '0.00000000', etaLabel: 'Under a minute', enabled: true },
  { coin: 'LTC', rail: 'FaucetPay', network: 'FaucetPay', min: '0.00020000', fee: '0.00000000', etaLabel: 'Under a minute', enabled: true },
  { coin: 'DOGE', rail: 'FaucetPay', network: 'FaucetPay', min: '0.100000', fee: '0.000000', etaLabel: 'Under a minute', enabled: true },
  { coin: 'TRX', rail: 'FaucetPay', network: 'FaucetPay', min: '0.100000', fee: '0.000000', etaLabel: 'Under a minute', enabled: true },
  { coin: 'SOL', rail: 'FaucetPay', network: 'FaucetPay', min: '0.00050000', fee: '0.00000000', etaLabel: 'Under a minute', enabled: true },
  { coin: 'TON', rail: 'FaucetPay', network: 'FaucetPay', min: '0.010000', fee: '0.000000', etaLabel: 'Under a minute', enabled: true },
  { coin: 'BNB', rail: 'FaucetPay', network: 'FaucetPay', min: '0.00010000', fee: '0.00000000', etaLabel: 'Under a minute', enabled: true },
  { coin: 'SHIB', rail: 'FaucetPay', network: 'FaucetPay', min: '1000', fee: '0', etaLabel: 'Under a minute', enabled: true },
  { coin: 'PEPE', rail: 'FaucetPay', network: 'FaucetPay', min: '1000', fee: '0', etaLabel: 'Under a minute', enabled: true },
  { coin: 'FLOKI', rail: 'FaucetPay', network: 'FaucetPay', min: '1000', fee: '0', etaLabel: 'Under a minute', enabled: true },
  { coin: 'BONK', rail: 'FaucetPay', network: 'FaucetPay', min: '1000', fee: '0', etaLabel: 'Under a minute', enabled: true },

  { coin: 'USDT', rail: 'CWallet', network: 'CWallet', min: '0.050000', fee: '0.000000', etaLabel: 'Under a minute', enabled: true },
  { coin: 'BTC', rail: 'CWallet', network: 'CWallet', min: '0.00001000', fee: '0.00000000', etaLabel: 'Under a minute', enabled: true },
  { coin: 'LTC', rail: 'CWallet', network: 'CWallet', min: '0.00050000', fee: '0.00000000', etaLabel: 'Under a minute', enabled: true },
  { coin: 'DOGE', rail: 'CWallet', network: 'CWallet', min: '1.000000', fee: '0.000000', etaLabel: 'Under a minute', enabled: true },
  { coin: 'TRX', rail: 'CWallet', network: 'CWallet', min: '1.000000', fee: '0.000000', etaLabel: 'Under a minute', enabled: true },

  { coin: 'USDT', rail: 'Direct', network: 'TRC-20', min: '2.000000', fee: '1.000000', etaLabel: 'Within 48 hours', enabled: true },
  { coin: 'TRX', rail: 'Direct', network: 'TRON', min: '20.000000', fee: '1.000000', etaLabel: 'Within 48 hours', enabled: true },
  { coin: 'LTC', rail: 'Direct', network: 'Litecoin', min: '0.01000000', fee: '0.00020000', etaLabel: 'Within 48 hours', enabled: true },
  { coin: 'DOGE', rail: 'Direct', network: 'Dogecoin', min: '20.000000', fee: '2.000000', etaLabel: 'Within 48 hours', enabled: true },
  { coin: 'SOL', rail: 'Direct', network: 'Solana', min: '0.02000000', fee: '0.00100000', etaLabel: 'Within 48 hours', enabled: true },
  { coin: 'TON', rail: 'Direct', network: 'TON', min: '1.000000', fee: '0.050000', etaLabel: 'Within 48 hours', enabled: true },
];

/** Indicative spot prices, replaced by /config/rates on the first pricing run. */
export const DEFAULT_SPOT: Record<CoinTicker, number> = {
  BTC: 95000, LTC: 95, TRX: 0.26, SOL: 150, DOGE: 0.16, USDT: 1,
  TON: 3.5, PEPE: 0.0000095, SHIB: 0.0000135, FLOKI: 0.00012, BONK: 0.000022, BNB: 620,
};
