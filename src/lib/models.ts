/* ============================================================================
   READ MODELS
   ----------------------------------------------------------------------------
   The shapes UI components render. Plain JSON only: no Firestore Timestamp, no
   class instance, no `undefined`. Everything crossing the server/client
   boundary is one of these, which is why every date is an ISO string.

   Persistence shapes live in `src/lib/firebase/schema.ts`. Server code maps
   one to the other in `src/server/**`.
   ========================================================================== */

export type CoinTicker =
  | 'BTC' | 'LTC' | 'TRX' | 'SOL' | 'DOGE' | 'USDT'
  | 'TON' | 'PEPE' | 'SHIB' | 'FLOKI' | 'BONK' | 'BNB';

export const COIN_TICKERS: CoinTicker[] = [
  'BTC', 'LTC', 'TRX', 'SOL', 'DOGE', 'USDT', 'TON', 'PEPE', 'SHIB', 'FLOKI', 'BONK', 'BNB',
];

export const COIN_NAMES: Record<CoinTicker, string> = {
  BTC: 'Bitcoin', LTC: 'Litecoin', TRX: 'TRON', SOL: 'Solana', DOGE: 'Dogecoin',
  USDT: 'Tether', TON: 'Toncoin', PEPE: 'Pepe', SHIB: 'Shiba Inu', FLOKI: 'Floki',
  BONK: 'Bonk', BNB: 'BNB',
};

export type PayoutRailName = 'FaucetPay' | 'CWallet' | 'Direct';

export type WithdrawalStatus =
  | 'Pending' | 'HeldForReview' | 'Processing' | 'Completed' | 'Rejected' | 'Failed' | 'Reversed';

export type ReferralTierName = 'Bronze' | 'Silver' | 'Gold' | 'Elite';

export type ClaimSource =
  | 'faucet' | 'ptc' | 'shortlink' | 'offerwall' | 'bonus'
  | 'challenge' | 'referral' | 'coupon' | 'lottery' | 'adjustment' | 'withdrawal' | 'refund';

export type EarningSourceKey = 'faucet' | 'ptc' | 'offerwall' | 'bonus' | 'challenge';

export type LeaderboardKey = 'offerwall' | 'referral' | 'shortlink' | 'faucet' | 'ptc';

export type Tone =
  | 'mint' | 'violet' | 'blue' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/* ---- VIEWER / PROFILE ---------------------------------------------------- */

/** Minimal identity, resolved from the session cookie on every request. */
export interface Viewer {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  username: string;
  initials: string;
  admin: boolean;
  adminRole: string | null;
}

export interface UserProfile {
  uid: string;
  username: string;
  email: string;
  emailVerified: boolean;
  initials: string;
  country: string;
  countryCode: string;
  level: number;
  /** EXP accumulated inside the current level. */
  exp: number;
  /** EXP required to finish the current level. */
  expNext: number;
  /** Integer tokens, spendable. */
  balance: number;
  /** Integer tokens reserved by a queued withdrawal. */
  lockedBalance: number;
  /** Advertiser credit, separate from earnings. */
  depositBalance: number;
  /** Percent added to every claim, from streak + level. */
  earningBonus: number;
  totalEarned: number;
  totalEarnedUsd: number;
  /** ISO date. */
  memberSince: string;
  streak: number;
  referralCode: string;
  referralLink: string;
  commissionRate: number;
  tier: ReferralTierName;
  claims: Record<'faucet' | 'ptc' | 'shortlink' | 'offerwall' | 'referrals', number>;
  displayCurrency: CoinTicker;
  suspended: boolean;
  roles: { admin?: boolean; support?: boolean; advertiser?: boolean };
}

/* ---- LEDGER -------------------------------------------------------------- */

export interface LedgerEntry {
  id: string;
  source: ClaimSource;
  /** Signed integer tokens. Negative for debits. */
  amount: number;
  exp: number;
  refId: string | null;
  label: string;
  /** ISO timestamp. */
  at: string;
}

/* ---- WITHDRAW ------------------------------------------------------------ */

export interface PayoutRail {
  coin: CoinTicker;
  rail: PayoutRailName;
  network: string;
  /** Decimal strings, in the asset's own unit. */
  min: string;
  fee: string;
  etaLabel: string;
  enabled: boolean;
}

export interface WithdrawalRecord {
  id: string;
  coin: CoinTicker;
  rail: PayoutRailName;
  network: string;
  address: string;
  amount: string;
  fee: string;
  receiveAmount: string;
  tokenCost: number;
  status: WithdrawalStatus;
  txid: string | null;
  /** ISO. */
  at: string;
  processedAt: string | null;
  failureReason: string | null;
}

export interface WithdrawQuote {
  coin: CoinTicker;
  rail: PayoutRailName;
  network: string;
  amount: string;
  fee: string;
  receiveAmount: string;
  tokenCost: number;
  usdValue: string;
  etaLabel: string;
  quotedAt: string;
  min: string;
  max: string;
}

export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  coin: CoinTicker;
  rail: PayoutRailName;
  /** ISO, or null when never used. */
  lastUsedAt: string | null;
}

/* ---- EARN ---------------------------------------------------------------- */

export interface FaucetState {
  rewardTokens: number;
  /** Representative EXP for display; equals `expMin` when a range applies. */
  exp: number;
  /** Lower bound of the EXP roll for this user's current tier. */
  expMin: number;
  /** Upper bound of the EXP roll. Equal to `expMin` when EXP is flat. */
  expMax: number;
  cooldownSeconds: number;
  /** ISO of the next allowed claim, or null when claimable now. */
  nextClaimAt: string | null;
  secondsRemaining: number;
  claimsToday: number;
  dailyCap: number;
  happyHourActive: boolean;
  happyHourBonusPct: number;
  /** ISO of the next happy-hour window start. */
  happyHourAt: string | null;
  captchaRequired: boolean;
}

export interface PtcAdItem {
  id: string;
  title: string;
  description: string;
  tokens: number;
  exp: number;
  seconds: number;
  cooldownHours: number;
  type: 'Window' | 'Iframe' | 'External' | 'Youtube';
  targetUrl: string;
  /** ISO when this ad becomes available again for the viewer, or null. */
  availableAt: string | null;
}

export interface ShortlinkItem {
  id: string;
  name: string;
  reward: number;
  exp: number;
  used: number;
  cap: number;
  seconds: number;
  provider: string | null;
  targetUrl: string;
  availableAt: string | null;
}

export interface DailyStep {
  day: number;
  tokens: number;
  exp: number;
  bonus: number;
}

export interface DailyState {
  steps: DailyStep[];
  /** Zero-based index of the step the viewer will claim next. */
  current: number;
  claimable: boolean;
  nextClaimAt: string | null;
  secondsRemaining: number;
  streakDays: number;
}

export interface ChallengeItem {
  id: string;
  title: string;
  tokens: number;
  exp: number;
  at: number;
  of: number;
  note: string | null;
  kind: 'referral' | 'shortlink' | 'ptc' | 'faucet' | 'offerwall';
  claimed: boolean;
  claimable: boolean;
}

export interface LotteryTicket {
  id: string;
  status: 'Pending' | 'Won' | 'Lost';
  /** ISO. */
  at: string;
  prize: number;
}

export interface LotteryState {
  round: string;
  prizePool: number;
  ticketPriceTokens: number;
  totalTickets: number;
  winnersPerDraw: number;
  /** ISO of the next draw. */
  drawsAt: string;
  myTickets: LotteryTicket[];
  maxPerUser: number;
}

export interface OfferProviderItem {
  id: string;
  name: string;
  rating: number;
  mark: string;
  hue: number;
  blurb: string;
  /** Iframe URL with {uid} substituted, or null when unconfigured. */
  url: string | null;
  enabled: boolean;
  featured: boolean;
}

export interface OfferConversion {
  id: string;
  provider: string;
  status: 'Approved' | 'Pending' | 'Rejected' | 'Reversed';
  reward: number;
  /** ISO. */
  at: string;
  offerName: string;
}

/* ---- SOCIAL -------------------------------------------------------------- */

export interface LeaderboardRow {
  uid: string;
  username: string;
  countryCode: string;
  value: number;
  prize: number;
  rank: number;
}

export interface LeaderboardBoard {
  key: LeaderboardKey;
  metric: string;
  unit: string;
  you: { rank: number | null; value: number };
  rows: LeaderboardRow[];
}

export interface ReferralRow {
  uid: string;
  username: string;
  countryCode: string;
  earned: number;
  level: number;
  /** ISO. */
  joined: string;
  lastActive: string;
  status: 'active' | 'idle' | 'dormant';
  qualified: boolean;
}

export interface ReferralTier {
  name: ReferralTierName;
  at: number;
  rate: number;
  perk: string;
}

export interface ReferralSummary {
  code: string;
  link: string;
  total: number;
  qualified: number;
  activeThisWeek: number;
  commissionEarned: number;
  tier: ReferralTierName;
  rate: number;
  nextTier: ReferralTier | null;
  toNextTier: number;
  rows: ReferralRow[];
  byCountry: ReferralGeoPoint[];
  clicks: number;
  signups: number;
}

export interface ReferralSource {
  label: string;
  value: number;
  color: string;
}

export interface ReferralGeoPoint {
  country: string;
  code: string;
  count: number;
  x: number;
  y: number;
}

/* ---- CHARTS -------------------------------------------------------------- */

export type EarningDay = { d: string } & Record<EarningSourceKey, number>;

export interface EarningSeries {
  key: EarningSourceKey;
  label: string;
  color: string;
}

/* ---- SUPPORT ------------------------------------------------------------- */

export interface TicketMessage {
  id: string;
  from: 'you' | 'ai' | 'agent';
  /** ISO. */
  at: string;
  body: string;
  agent: string | null;
}

export interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  status: 'Open' | 'Answered' | 'Closed';
  unread: boolean;
  /** ISO. */
  updated: string;
  messages: TicketMessage[];
}

export interface AppNotification {
  id: string;
  icon: 'checkCircle' | 'coins' | 'users' | 'flame' | 'ticket';
  tone: 'success' | 'mint' | 'info' | 'warning' | 'violet';
  title: string;
  body: string;
  href: string | null;
  /** ISO. */
  at: string;
  unread: boolean;
}

/* ---- ADVERTISER --------------------------------------------------------- */

export interface Campaign {
  id: string;
  title: string;
  type: PtcAdItem['type'];
  status: 'Active' | 'Paused' | 'Pending' | 'Completed' | 'Suspended';
  views: number;
  of: number;
  cpc: number;
  spend: number;
  /** ISO. */
  createdAt: string;
}

export interface DepositRow {
  id: string;
  status: 'Credited' | 'Failed' | 'Pending';
  amount: string;
  tokens: number;
  method: string;
  /** ISO. */
  at: string;
}

export interface CouponRow {
  id: string;
  code: string;
  balance: number;
  adBalance: number;
  discount: string;
  /** ISO. */
  at: string;
}

export interface ApiEndpoint {
  name: string;
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  description: string;
}

/* ---- PUBLIC STATS ------------------------------------------------------- */

/**
 * The homepage numbers. Written by `src/server/stats.ts` counters on every
 * credit and payout, so these are live aggregates — never constants.
 */
export interface PlatformStats {
  members: number;
  membersToday: number;
  claimsAllTime: number;
  claimsToday: number;
  tokensPaidAllTime: number;
  paidOutUsd: number;
  withdrawalsAllTime: number;
  withdrawalsToday: number;
  onlineNow: number;
  /** ISO. */
  updatedAt: string;
}

export interface PayoutTickerRow {
  username: string;
  countryCode: string;
  amount: string;
  coin: CoinTicker;
  /** ISO. */
  at: string;
}
