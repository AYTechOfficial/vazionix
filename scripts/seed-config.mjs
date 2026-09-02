/* ============================================================================
   SEED THE CONFIGURATION DOCUMENTS
   ----------------------------------------------------------------------------
   Usage:
     npm run seed:config
     npm run seed:config -- --dry-run
     npm run seed:config -- --only economy,rates

   Writes the six documents a fresh project needs before the admin console has
   anything to show:

     /config/economy   rewards, cooldowns, caps, levels, tiers, lottery, withdraw
     /config/rates     usdPerToken, spot prices, the payout rail table
     /config/site      maintenance and feature flags
     /config/ads       ad master switches, overlay route blocks, exemptions
     /stats/global     lifetime counters, at zero
     /lottery/current  round r1, seeded pool, next draw time

   IDEMPOTENT, IN THE ONLY WAY THAT MATTERS
   It merges MISSING keys and never overwrites a value that is already there. Run
   it after every release: a release that adds `faucet.happyHourLengthMinutes`
   gets the new key written, and the `faucet.reward` you tuned at 2am during a
   traffic spike is left exactly as you set it. There is deliberately no
   `--force`: a flag that reverts live economy configuration is a flag somebody
   will eventually run against production.

   WHY THIS SCRIPT IS OPTIONAL, AND WHY YOU STILL WANT IT
   The app does not need these documents. `src/server/config.ts` merges whatever
   Firestore holds over the compiled defaults, so a project with no /config
   serves a working site on the shipped numbers. What it cannot do is show them
   to you: Admin → Modules renders what is in Firestore, so an unseeded project
   presents empty fields and no way to discover that the faucet pays 65 tokens.
   This script makes the defaults visible and therefore editable.

   THE DEFAULTS BELOW ARE A COPY
   Source of truth is DEFAULT_ECONOMY / DEFAULT_RAILS / DEFAULT_SPOT in
   src/lib/config/economy.ts, DEFAULT_SITE in src/server/config.ts, and
   DEFAULT_AD_BEHAVIOUR in src/lib/ads/config.ts. A .mjs script cannot import a
   TypeScript module, so they are duplicated here. Drift is not dangerous — the
   app always merges over its own compiled copy — but it is confusing, so if you
   change a default in code, change it here in the same commit.
   ========================================================================== */

import { bail, banner, db, heading, line, mergeMissing, now, parseArgs } from './_firebase.mjs';

/* ---- ECONOMY --------------------------------------------------------------- */

const ECONOMY = {
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
  levels: { base: 100, growth: 1.18, bonusBpsPerLevel: 20, bonusBpsPerStreakDay: 10, maxBonusBps: 1500 },
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

/* ---- RATES ------------------------------------------------------------------
   Amounts are decimal STRINGS. An 8-decimal asset in a JavaScript float is a
   rounding bug waiting for a support ticket, and Firestore stores a JS number as
   a double. The server parses these with its own decimal helpers.

   The spot prices are indicative starting values so the withdraw page can quote
   before the first pricing run. The scheduled `refreshRates` job overwrites
   `spot` on its next tick — which is why seeding them here is safe and why they
   do not need to be accurate.                                                */

const rail = (coin, railName, network, min, fee, etaLabel) => ({
  coin,
  rail: railName,
  network,
  min,
  fee,
  etaLabel,
  enabled: true,
});

const RATES = {
  usdPerToken: 0.0000098,
  spot: {
    BTC: 95000,
    LTC: 95,
    TRX: 0.26,
    SOL: 150,
    DOGE: 0.16,
    USDT: 1,
    TON: 3.5,
    PEPE: 0.0000095,
    SHIB: 0.0000135,
    FLOKI: 0.00012,
    BONK: 0.000022,
    BNB: 620,
  },
  rails: [
    rail('USDT', 'FaucetPay', 'FaucetPay', '0.010000', '0.000000', 'Under a minute'),
    rail('BTC', 'FaucetPay', 'FaucetPay', '0.00000500', '0.00000000', 'Under a minute'),
    rail('LTC', 'FaucetPay', 'FaucetPay', '0.00020000', '0.00000000', 'Under a minute'),
    rail('DOGE', 'FaucetPay', 'FaucetPay', '0.100000', '0.000000', 'Under a minute'),
    rail('TRX', 'FaucetPay', 'FaucetPay', '0.100000', '0.000000', 'Under a minute'),
    rail('SOL', 'FaucetPay', 'FaucetPay', '0.00050000', '0.00000000', 'Under a minute'),
    rail('TON', 'FaucetPay', 'FaucetPay', '0.010000', '0.000000', 'Under a minute'),
    rail('BNB', 'FaucetPay', 'FaucetPay', '0.00010000', '0.00000000', 'Under a minute'),
    rail('SHIB', 'FaucetPay', 'FaucetPay', '1000', '0', 'Under a minute'),
    rail('PEPE', 'FaucetPay', 'FaucetPay', '1000', '0', 'Under a minute'),
    rail('FLOKI', 'FaucetPay', 'FaucetPay', '1000', '0', 'Under a minute'),
    rail('BONK', 'FaucetPay', 'FaucetPay', '1000', '0', 'Under a minute'),
    rail('USDT', 'CWallet', 'CWallet', '0.050000', '0.000000', 'Under a minute'),
    rail('BTC', 'CWallet', 'CWallet', '0.00001000', '0.00000000', 'Under a minute'),
    rail('LTC', 'CWallet', 'CWallet', '0.00050000', '0.00000000', 'Under a minute'),
    rail('DOGE', 'CWallet', 'CWallet', '1.000000', '0.000000', 'Under a minute'),
    rail('TRX', 'CWallet', 'CWallet', '1.000000', '0.000000', 'Under a minute'),
    rail('USDT', 'Direct', 'TRC-20', '2.000000', '1.000000', 'Within 48 hours'),
    rail('TRX', 'Direct', 'TRON', '20.000000', '1.000000', 'Within 48 hours'),
    rail('LTC', 'Direct', 'Litecoin', '0.01000000', '0.00020000', 'Within 48 hours'),
    rail('DOGE', 'Direct', 'Dogecoin', '20.000000', '2.000000', 'Within 48 hours'),
    rail('SOL', 'Direct', 'Solana', '0.02000000', '0.00100000', 'Within 48 hours'),
    rail('TON', 'Direct', 'TON', '1.000000', '0.050000', 'Within 48 hours'),
  ],
};

/* ---- SITE FLAGS -------------------------------------------------------------
   `maintenance` is the kill switch; `withdrawalsOpen` and `earningOpen` are the
   two narrower ones you will actually reach for, because pausing payouts during a
   rail outage should not also stop people earning.                           */

const SITE = {
  maintenance: false,
  maintenanceMessage: 'We are performing scheduled maintenance. Earning resumes shortly.',
  signupsOpen: true,
  withdrawalsOpen: true,
  earningOpen: true,
  announcement: null,
  announcementTone: 'info',
};

/* ---- AD BEHAVIOUR -----------------------------------------------------------
   `overlayBlockedRoutes` is the one setting here with a money consequence: a
   popunder firing mid-payout is the single ad interaction that costs more than it
   earns, so /withdraw, /login, /register and /admin are excluded from every
   overlay format regardless of what an individual unit is configured to do.
   `showPlaceholders` is seeded false: in code it defaults to
   `NODE_ENV !== 'production'`, and a seeded document is read in production.  */

const ADS = {
  enabled: true,
  exemptUids: [],
  overlayBlockedRoutes: ['/withdraw', '/login', '/register', '/admin'],
  interstitialEveryNNavigations: 5,
  popunderPerSession: 1,
  showPlaceholders: false,
};

/* ---- COUNTERS ---------------------------------------------------------------
   Seeded at zero so the landing page renders real numbers instead of blanks on
   day one. `bumpStat()` increments these inside the same transaction as the thing
   they count; because the merge only writes MISSING keys, re-running this script
   after launch cannot reset a counter.                                       */

const STATS_GLOBAL = {
  members: 0,
  claims: 0,
  tokensCredited: 0,
  withdrawals: 0,
  tokensWithdrawn: 0,
  usdWithdrawn: 0,
  ptcViews: 0,
  shortlinkClaims: 0,
  offerwallConversions: 0,
  adImpressions: 0,
};

/** Next occurrence of a weekday + UTC hour. Mirrors `nextUtcWeekday` in
    src/server/db.ts so the seeded draw time matches what the app computes. */
function nextUtcWeekday(dayOfWeek, hourUtc, from = new Date()) {
  const target = new Date(from);
  target.setUTCHours(hourUtc, 0, 0, 0);
  const delta = (dayOfWeek - target.getUTCDay() + 7) % 7;
  target.setUTCDate(target.getUTCDate() + delta);
  if (target <= from) target.setUTCDate(target.getUTCDate() + 7);
  return target;
}

const LOTTERY_CURRENT = {
  round: 'r1',
  pool: ECONOMY.lottery.seedPool,
  totalTickets: 0,
  closed: false,
  drawsAt: nextUtcWeekday(ECONOMY.lottery.drawDayUtc, ECONOMY.lottery.drawHourUtc),
};

const TARGETS = [
  { key: 'economy', path: 'config/economy', values: ECONOMY },
  { key: 'rates', path: 'config/rates', values: RATES },
  { key: 'site', path: 'config/site', values: SITE },
  { key: 'ads', path: 'config/ads', values: ADS },
  { key: 'stats', path: 'stats/global', values: STATS_GLOBAL },
  { key: 'lottery', path: 'lottery/current', values: LOTTERY_CURRENT },
];

async function main() {
  const { flags } = parseArgs();

  /* Help before `banner()`, which initialises the Admin SDK — usage should print
     on a machine that has no credentials configured yet. */
  if (flags.has('help')) {
    line();
    line('  --dry-run        report what would be written, write nothing.');
    line(`  --only a,b       any of: ${TARGETS.map((t) => t.key).join(', ')}.`);
    line();
    return;
  }

  banner('seed-config');

  const only = (flags.get('only') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (only.length) {
    const unknown = only.filter((k) => !TARGETS.some((t) => t.key === k));
    if (unknown.length) {
      bail(`Unknown --only target(s): ${unknown.join(', ')}.\nValid: ${TARGETS.map((t) => t.key).join(', ')}.`);
    }
  }

  const dryRun = flags.get('dry-run') === 'true' || flags.has('dry-run');
  const selected = only.length ? TARGETS.filter((t) => only.includes(t.key)) : TARGETS;

  let written = 0;
  let untouched = 0;

  for (const target of selected) {
    if (dryRun) {
      const snap = await db().doc(target.path).get();
      const missing = missingKeys(snap.exists ? (snap.data() ?? {}) : {}, target.values);
      heading(`/${target.path} ${snap.exists ? '(exists)' : '(missing)'}`);
      if (!missing.length) line('  nothing to add');
      else for (const key of missing) line(`  + ${key}`);
      continue;
    }

    const { created, added } = await mergeMissing(target.path, target.values);
    heading(`/${target.path} ${created ? '(created)' : '(merged)'}`);
    if (!added.length) {
      line('  already complete, nothing written');
      untouched += 1;
    } else {
      for (const key of added) line(`  + ${key}`);
      written += 1;
    }
  }

  if (dryRun) {
    heading('Dry run');
    line('  Nothing was written. Drop --dry-run to apply.');
    line();
    return;
  }

  /* One touch on /config/site regardless, so `updatedAt` reflects the seed run
     even when every key was already present. It is the document the console
     shows a "last changed" timestamp for. */
  await db().doc('config/site').set({ seededAt: now() }, { merge: true });

  heading('Done');
  line(`  ${written} document(s) updated, ${untouched} already complete.`);
  line();
  line('  Values you should change before taking payments:');
  line('    config/rates.usdPerToken     what one token is worth in USD.');
  line('    config/economy.faucet.*      reward and cooldown set your burn rate.');
  line('    config/economy.withdraw.*    minimums, daily count, review threshold.');
  line('    config/rates.rails[].enabled turn off any rail you have no key for.');
  line();
  line('  All of them are editable in Admin → Modules and Admin → Rates without a');
  line('  deploy. Nothing here needs this script again except after a release that');
  line('  adds a new configuration key.');
  line();
}

/** Dry-run twin of the merge in _firebase.mjs. Kept separate rather than sharing
    a code path with a boolean, so a bug in the reporting can never write. */
function missingKeys(current, desired, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(desired)) {
    const at = prefix ? `${prefix}.${key}` : key;
    const existing = current?.[key];
    const bothPlain =
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing !== null &&
      typeof existing === 'object' &&
      !Array.isArray(existing);
    if (bothPlain) out.push(...missingKeys(existing, value, at));
    else if (existing === undefined) out.push(at);
  }
  return out;
}

main().catch((error) => {
  bail(`seed-config failed.\n${error?.stack ?? error}`);
});
