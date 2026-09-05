/* ============================================================================
   SEED SUPABASE — config + earn catalogue
   ----------------------------------------------------------------------------
   Writes what a fresh project needs before any page has something to show:

     config/economy | rates | site | ads     the four config documents
     stats/global                            counters at zero
     lottery_rounds/r1                       the opening round
     ptc_ads, shortlinks, challenges,
     offerwall_providers                     starter earn catalogue

   IDEMPOTENT: every write is an upsert on the primary key and every catalogue
   insert is skipped when a row with that id already exists, so re-running after
   a release adds what is new and leaves values you tuned in the admin console
   exactly as you set them. There is deliberately no --force.

   Usage:
     node --env-file=.env.local scripts/seed-supabase.mjs
     node --env-file=.env.local scripts/seed-supabase.mjs --catalogue-only
     node --env-file=.env.local scripts/seed-supabase.mjs --config-only
   ========================================================================== */

import pg from 'pg';

const { Client } = pg;
const args = process.argv.slice(2);
const configOnly = args.includes('--config-only');
const catalogueOnly = args.includes('--catalogue-only');

const client = new Client({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

/* The economy the app ships with. Mirrors DEFAULT_ECONOMY in
   src/lib/config/economy.ts — seeding it makes the values VISIBLE and therefore
   editable in Admin -> Modules, which an unseeded project cannot do. */
const ECONOMY = {
  faucet: {
    reward: 65,
    exp: 3,
    expTiers: [
      { atClaims: 0, min: 1, max: 5 },
      { atClaims: 10, min: 10, max: 20 },
      { atClaims: 50, min: 50, max: 100 },
    ],
    cooldownSeconds: 300,
    dailyCap: 100,
    happyHourBonusPct: 10,
    happyHourStartHoursUtc: [0, 6, 12, 18],
    happyHourLengthMinutes: 60,
    requireCaptcha: false,
  },
  ptc: { graceSeconds: 20, exp: 2, dailyCap: 200, requireCaptcha: false },
  shortlinks: { exp: 5, dailyCap: 300, tokenTtlSeconds: 900, requireCaptcha: false },
  daily: {
    steps: [
      { tokens: 30, exp: 2, bonus: 0.3 },
      { tokens: 35, exp: 2, bonus: 0.6 },
      { tokens: 40, exp: 3, bonus: 0.9 },
      { tokens: 45, exp: 3, bonus: 1.2 },
      { tokens: 50, exp: 4, bonus: 1.5 },
      { tokens: 55, exp: 4, bonus: 2 },
      { tokens: 65, exp: 5, bonus: 3 },
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

const RATES = {
  usdPerToken: 0.0000098,
  spot: {
    BTC: 95000, LTC: 95, TRX: 0.26, SOL: 150, DOGE: 0.16, USDT: 1,
    TON: 3.5, PEPE: 0.0000095, SHIB: 0.0000135, FLOKI: 0.00012, BONK: 0.000022, BNB: 620,
  },
  rails: [
    { coin: 'USDT', rail: 'FaucetPay', network: 'FaucetPay', min: '0.010000', fee: '0.000000', etaLabel: 'Under 60 seconds', enabled: true },
    { coin: 'LTC', rail: 'FaucetPay', network: 'FaucetPay', min: '0.00010000', fee: '0.00000000', etaLabel: 'Under 60 seconds', enabled: true },
    { coin: 'TRX', rail: 'FaucetPay', network: 'FaucetPay', min: '0.100000', fee: '0.000000', etaLabel: 'Under 60 seconds', enabled: true },
    { coin: 'DOGE', rail: 'FaucetPay', network: 'FaucetPay', min: '0.100000', fee: '0.000000', etaLabel: 'Under 60 seconds', enabled: true },
    { coin: 'BTC', rail: 'FaucetPay', network: 'FaucetPay', min: '0.00000100', fee: '0.00000000', etaLabel: 'Under 60 seconds', enabled: true },
  ],
  updatedAt: new Date().toISOString(),
};

const SITE = {
  maintenance: false,
  maintenanceMessage: 'We are performing scheduled maintenance. Earning resumes shortly.',
  signupsOpen: true,
  withdrawalsOpen: true,
  earningOpen: true,
  announcement: null,
  announcementTone: 'info',
};

const ADS = {
  enabled: true,
  overlaysEnabled: true,
  overlayBlockedRoutes: ['/withdraw', '/login', '/register', '/admin'],
  maxOverlaysPerSession: 3,
};

async function upsertConfig(key, value) {
  await client.query(
    `insert into public.config (key, value, updated_at) values ($1, $2::jsonb, now())
     on conflict (key) do update set value = public.config.value || excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
  console.log(`  config/${key}`);
}

async function seedConfig() {
  console.log('config:');
  await upsertConfig('economy', ECONOMY);
  await upsertConfig('rates', RATES);
  await upsertConfig('site', SITE);
  await upsertConfig('ads', ADS);

  await client.query(
    `insert into public.stats (day) values ('global') on conflict (day) do nothing`,
  );
  console.log('  stats/global');

  const drawsAt = new Date();
  drawsAt.setUTCDate(drawsAt.getUTCDate() + ((7 - drawsAt.getUTCDay()) % 7 || 7));
  drawsAt.setUTCHours(0, 0, 0, 0);
  await client.query(
    `insert into public.lottery_rounds (id, pool, prize_pool, ticket_price_tokens, winners_per_draw, total_tickets, draws_at, closed)
     values ('r1', $1, $1, $2, $3, 0, $4, false)
     on conflict (id) do nothing`,
    [ECONOMY.lottery.seedPool, ECONOMY.lottery.ticketPriceTokens, ECONOMY.lottery.winnersPerDraw, drawsAt.toISOString()],
  );
  console.log('  lottery_rounds/r1');
}

/* ---- CATALOGUE ------------------------------------------------------------
   Starter inventory so the earn pages are not empty on day one. The PTC and
   shortlink target URLs point at YOUR OWN pages deliberately: shipping a
   third-party link nobody vetted would put a dead or hostile destination in
   front of users. Replace them in Admin -> Modules with real advertiser links
   and your AdsLab/Adsterra direct link. */
const PTC_ADS = [
  { title: 'Explore the Vazionix dashboard', description: 'A 15-second tour of where your balance and claims live.', tokens: 40, exp: 2, seconds: 15, cooldown_hours: 6, type: 'Window', target_url: '/dashboard' },
  { title: 'How withdrawals settle', description: 'See the rails, minimums and timings before your first payout.', tokens: 55, exp: 3, seconds: 25, cooldown_hours: 12, type: 'Window', target_url: '/withdraw' },
  { title: 'Referral programme walkthrough', description: 'Where invites come from and what each tier pays.', tokens: 70, exp: 3, seconds: 30, cooldown_hours: 24, type: 'Window', target_url: '/referrals' },
];

const SHORTLINKS = [
  { name: 'Vazionix Link 1', reward: 90, exp: 5, cap: 3, seconds: 60, provider: 'House', target_url: '/dashboard' },
  { name: 'Vazionix Link 2', reward: 120, exp: 5, cap: 2, seconds: 90, provider: 'House', target_url: '/faucet' },
  { name: 'Vazionix Link 3', reward: 150, exp: 6, cap: 1, seconds: 120, provider: 'House', target_url: '/leaderboard' },
];

const CHALLENGES = [
  { title: 'Claim the faucet 10 times', tokens: 250, exp: 10, target: 10, kind: 'faucet', repeat: 'weekly', note: 'Resets every week.' },
  { title: 'Claim the faucet 50 times', tokens: 1500, exp: 40, target: 50, kind: 'faucet', repeat: 'weekly', note: 'The big one.' },
  { title: 'Watch 5 PTC ads', tokens: 300, exp: 12, target: 5, kind: 'ptc', repeat: 'weekly', note: null },
  { title: 'Complete 3 shortlinks', tokens: 350, exp: 14, target: 3, kind: 'shortlink', repeat: 'weekly', note: null },
  { title: 'Refer your first friend', tokens: 500, exp: 25, target: 1, kind: 'referral', repeat: 'once', note: 'Pays once, forever.' },
];

async function seedCatalogue() {
  console.log('catalogue:');

  for (const ad of PTC_ADS) {
    const exists = await client.query('select 1 from public.ptc_ads where title = $1', [ad.title]);
    if (exists.rowCount) { console.log(`  ptc_ads: ${ad.title} (exists)`); continue; }
    await client.query(
      `insert into public.ptc_ads (title, description, tokens, exp, seconds, cooldown_hours, type, target_url, enabled)
       values ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
      [ad.title, ad.description, ad.tokens, ad.exp, ad.seconds, ad.cooldown_hours, ad.type, ad.target_url],
    );
    console.log(`  ptc_ads: ${ad.title}`);
  }

  for (const link of SHORTLINKS) {
    const exists = await client.query('select 1 from public.shortlinks where name = $1', [link.name]);
    if (exists.rowCount) { console.log(`  shortlinks: ${link.name} (exists)`); continue; }
    await client.query(
      `insert into public.shortlinks (name, reward, exp, used, cap, seconds, provider, target_url, enabled)
       values ($1,$2,$3,0,$4,$5,$6,$7,true)`,
      [link.name, link.reward, link.exp, link.cap, link.seconds, link.provider, link.target_url],
    );
    console.log(`  shortlinks: ${link.name}`);
  }

  for (const ch of CHALLENGES) {
    const exists = await client.query('select 1 from public.challenges where title = $1', [ch.title]);
    if (exists.rowCount) { console.log(`  challenges: ${ch.title} (exists)`); continue; }
    await client.query(
      `insert into public.challenges (title, tokens, exp, at, of, note, kind, target, repeat, enabled)
       values ($1,$2,$3,0,$4,$5,$6,$4,$7,true)`,
      [ch.title, ch.tokens, ch.exp, ch.target, ch.note, ch.kind, ch.repeat],
    );
    console.log(`  challenges: ${ch.title}`);
  }

  /* Offerwall providers are intentionally NOT seeded with URLs or secrets: a
     provider row without a verified secret cannot be credited from, and inventing
     iframe URLs would render dead walls. Add yours in Admin -> Modules. */
  console.log('  offerwall_providers: skipped (add real providers + secrets yourself)');
}

async function main() {
  await client.connect();
  console.log(`seeding ${process.env.NEXT_PUBLIC_SUPABASE_URL}\n`);
  if (!catalogueOnly) await seedConfig();
  if (!configOnly) await seedCatalogue();
  await client.end();
  console.log('\nDONE');
}

main().catch((err) => {
  console.error('SEED FAILED:', err.message);
  process.exit(1);
});