import type { Timestamp } from 'firebase/firestore';

import type {
  CoinTicker,
  PayoutRailName,
  ReferralTierName,
  WithdrawalStatus,
} from '@/lib/models';

/* ============================================================================
   FIRESTORE SCHEMA
   ----------------------------------------------------------------------------
   The persistence shapes, with document paths as first-class constants so no
   string path is ever typed twice. `src/lib/models.ts` holds the *read
   models* the UI renders; these are what actually sits on disk.

   Conventions:
   • Every document carries `createdAt` / `updatedAt` as server timestamps.
   • Money is stored as an integer count of TOKENS, never a float. Floating
     point on a balance is how you end up with 6851.789999999999.
   • Fields the client may NOT write are grouped and commented as such; the
     grouping mirrors firestore.rules exactly, so the two stay reviewable
     side by side.
   • Denormalised copies (username on a leaderboard entry) are written only by
     Cloud Functions and are explicitly marked, so nobody tries to keep them
     fresh from the client.

   COLLECTION MAP
     /users/{uid}
     /users/{uid}/claims/{claimId}
     /users/{uid}/notifications/{notificationId}
     /withdrawals/{withdrawalId}
     /referrals/{uid}/list/{refUid}
     /leaderboard/{period}/entries/{uid}
     /chats/{uid}/messages/{messageId}
     /tickets/{ticketId}/messages/{messageId}
     /campaigns/{campaignId}
     /offerwallConversions/{conversionId}
     /config/rates
   ========================================================================== */

/** Every path in the product, in one place. */
export const paths = {
  user: (uid: string) => `users/${uid}`,
  claims: (uid: string) => `users/${uid}/claims`,
  claim: (uid: string, claimId: string) => `users/${uid}/claims/${claimId}`,
  notifications: (uid: string) => `users/${uid}/notifications`,
  notification: (uid: string, id: string) => `users/${uid}/notifications/${id}`,
  withdrawals: () => 'withdrawals',
  withdrawal: (id: string) => `withdrawals/${id}`,
  referralList: (uid: string) => `referrals/${uid}/list`,
  referral: (uid: string, refUid: string) => `referrals/${uid}/list/${refUid}`,
  leaderboardEntries: (period: LeaderboardPeriod) => `leaderboard/${period}/entries`,
  leaderboardEntry: (period: LeaderboardPeriod, uid: string) => `leaderboard/${period}/entries/${uid}`,
  chatMessages: (uid: string) => `chats/${uid}/messages`,
  chatMessage: (uid: string, id: string) => `chats/${uid}/messages/${id}`,
  ticket: (id: string) => `tickets/${id}`,
  ticketMessages: (ticketId: string) => `tickets/${ticketId}/messages`,
  ticketMessage: (ticketId: string, id: string) => `tickets/${ticketId}/messages/${id}`,
  campaign: (id: string) => `campaigns/${id}`,
  offerwallConversion: (id: string) => `offerwallConversions/${id}`,
  configRates: () => 'config/rates',
} as const;

/** Collection-group ids, for collectionGroup() queries. */
export const groups = {
  claims: 'claims',
  /** The referral tree: one collectionGroup query answers "all referrals of
      anyone", which is what the tier and commission jobs iterate. */
  referralList: 'list',
  leaderboardEntries: 'entries',
  ticketMessages: 'messages',
} as const;

export type LeaderboardPeriod = `${number}-W${number}` | 'current' | 'previous';
export type LeaderboardBoardId = 'offerwall' | 'referral' | 'shortlink' | 'faucet' | 'ptc';
export type ClaimSource = 'faucet' | 'ptc' | 'shortlink' | 'offerwall' | 'bonus' | 'challenge' | 'referral' | 'coupon' | 'lottery';

interface Audited {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/* ---------------------------------------------------------------- /users --- */
export interface UserDoc extends Audited {
  /* -- client-writable profile ------------------------------------------- */
  username: string;
  usernameLower: string; // for case-insensitive uniqueness + search
  email: string;
  countryCode: string;
  avatarInitials: string;
  notificationPrefs: Record<string, boolean>;
  displayCurrency: CoinTicker;

  /* -- SERVER-WRITE-ONLY --------------------------------------------------
     firestore.rules denies any client write that touches these keys. Only
     Cloud Functions (which bypass rules via the Admin SDK) may mutate them.
     If you add a field here, add it to the same list in firestore.rules. */
  balance: number; // integer tokens
  lockedBalance: number; // tokens reserved by a queued withdrawal
  level: number;
  exp: number;
  totalEarned: number; // integer tokens, lifetime
  streakDays: number;
  lastStreakClaimAt: Timestamp | null;
  earningBonusBps: number; // basis points, so 0.7% is 70 — no floats on money maths
  referralCode: string;
  referredBy: string | null; // uid
  referralTier: ReferralTierName;
  commissionBps: number;
  /** Set by a Cloud Function from Auth custom claims; mirrored here so rules
      and queries can read it without a token refresh. */
  roles: { support?: boolean; advertiser?: boolean; admin?: boolean };
  suspended: boolean;
  suspendedReason: string | null;
}

/* ------------------------------------------------- /users/{uid}/claims --- */
/** The append-only earnings ledger. One document per credited action. */
export interface ClaimDoc extends Audited {
  source: ClaimSource;
  /** Integer tokens, always positive. Debits live in /withdrawals. */
  amount: number;
  exp: number;
  /** Free-form reference: PTC ad id, shortlink id, conversion id, challenge id. */
  refId: string | null;
  /** Bonus applied at claim time, in basis points, recorded so a user can
      audit why two identical claims paid differently. */
  bonusBps: number;
  /** Anti-fraud metadata captured server-side, never written by the client. */
  ip: string | null;
  userAgentHash: string | null;
}

/* ------------------------------------------ /users/{uid}/notifications --- */
export interface NotificationDoc extends Audited {
  icon: 'checkCircle' | 'coins' | 'users' | 'flame' | 'ticket';
  tone: 'success' | 'mint' | 'info' | 'warning' | 'violet';
  title: string;
  body: string;
  href: string | null;
  /** The ONE field a client may flip on this document. */
  read: boolean;
}

/* -------------------------------------------------------- /withdrawals --- */
export interface WithdrawalDoc extends Audited {
  uid: string;
  coin: CoinTicker;
  rail: PayoutRailName;
  network: string;
  address: string;
  /** All amounts in the ASSET's smallest sensible unit as a string, to avoid
      float drift on 8-decimal assets. Parsed with a decimal library server-side. */
  amount: string;
  fee: string;
  receiveAmount: string;
  /** Tokens debited from the balance to fund this payout. */
  tokenCost: number;
  /** Quote held at submit time, so a later price move cannot be disputed. */
  quotedUsdPerUnit: string;
  quotedAt: Timestamp;

  /* -- SERVER-WRITE-ONLY -------------------------------------------------- */
  status: WithdrawalStatus;
  /** Populated once broadcast. Null while Pending/Processing. */
  txid: string | null;
  /** For Direct on-chain payouts: which 48h batch this joined. */
  batchId: string | null;
  processedAt: Timestamp | null;
  failureReason: string | null;
  /** Fraud review outcome, if the payout was held. */
  reviewedBy: string | null;
}

/* ----------------------------------------- /referrals/{uid}/list/{ref} --- */
/** One edge of the referral tree. Document id IS the referred user's uid, so
    the edge is unique by construction — you cannot be referred twice. */
export interface ReferralDoc extends Audited {
  /** Denormalised for list rendering; refreshed by onReferralLevelUp. */
  username: string;
  countryCode: string;
  level: number;
  /** Integer tokens the referral has earned, lifetime. */
  totalEarned: number;
  /** Integer tokens paid to the referrer from this edge, lifetime. */
  commissionPaid: number;
  /** Counts toward tier only once the referral reaches level 1. */
  qualified: boolean;
  lastActiveAt: Timestamp;
  joinedAt: Timestamp;
}

/* ------------------------------- /leaderboard/{period}/entries/{uid} ----- */
export interface LeaderboardEntryDoc {
  uid: string;
  username: string;
  countryCode: string;
  board: LeaderboardBoardId;
  /** The metric being ranked — claims, or tokens claimed. */
  value: number;
  /** Written by resetLeaderboards; null while the period is live. */
  finalRank: number | null;
  prizeTokens: number;
  updatedAt: Timestamp;
}

/** The period document itself, holding the aggregate podium so the top three
    are one read rather than three. */
export interface LeaderboardPeriodDoc {
  startsAt: Timestamp;
  endsAt: Timestamp;
  closed: boolean;
  podium: Record<LeaderboardBoardId, Array<Pick<LeaderboardEntryDoc, 'uid' | 'username' | 'countryCode' | 'value' | 'prizeTokens'>>>;
}

/* ------------------------------------------- /chats/{uid}/messages/{id} -- */
export interface ChatMessageDoc {
  from: 'user' | 'ai' | 'agent';
  /** Present only when `from === 'agent'`. */
  agentUid: string | null;
  agentName: string | null;
  body: string;
  /** Deep-link actions the assistant attached to its answer. */
  actions: Array<{ label: string; href: string }>;
  createdAt: Timestamp;
}

/** Parent doc at /chats/{uid}. Holds the state escalateStaleChat reads. */
export interface ChatDoc {
  uid: string;
  mode: 'ai' | 'queue' | 'agent';
  lastMessageAt: Timestamp;
  /** Set when the conversation was converted into a ticket. */
  escalatedTicketId: string | null;
  resolved: boolean;
}

/* --------------------------------------------------------- /tickets/{id} - */
export interface TicketDoc extends Audited {
  uid: string;
  subject: string;
  category: 'Offerwall' | 'Withdraw' | 'Referrals' | 'Account' | 'Advertising' | 'Other';
  status: 'Open' | 'Answered' | 'Closed';
  /** Denormalised for the inbox list. */
  lastMessagePreview: string;
  lastMessageAt: Timestamp;
  unreadForUser: boolean;
  unreadForSupport: boolean;
  /** uid of the support agent who owns it. */
  assignedTo: string | null;
  /** Populated when the ticket came from an escalated AI chat. */
  sourceChatUid: string | null;
}

export interface TicketMessageDoc {
  authorUid: string;
  authorRole: 'user' | 'support' | 'ai';
  authorName: string;
  body: string;
  attachments: Array<{ path: string; contentType: string; bytes: number }>;
  createdAt: Timestamp;
}

/* ------------------------------------------------------- /campaigns/{id} - */
export interface CampaignDoc extends Audited {
  ownerUid: string;
  title: string;
  description: string;
  targetUrl: string;
  type: 'Window' | 'Iframe' | 'External' | 'Youtube';
  durationSeconds: number;
  intervalHours: number;
  /* -- SERVER-WRITE-ONLY -------------------------------------------------- */
  status: 'Active' | 'Paused' | 'Pending' | 'Completed' | 'Suspended';
  viewsDelivered: number;
  viewsPurchased: number;
  cpcUsd: number;
  spendUsd: number;
  /** Moderation. A campaign is Pending until a human or classifier clears it. */
  reviewedAt: Timestamp | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
}

/* ---------------------------------------- /offerwallConversions/{id} ----- */
/**
 * IDEMPOTENCY KEY. The document id is the PROVIDER's conversion id, so a
 * duplicate postback — which every offerwall provider sends, routinely — is a
 * failed `create` rather than a double credit. This is the entire reason this
 * is a top-level collection and not a subcollection of the user.
 */
export interface OfferwallConversionDoc {
  provider: string;
  uid: string;
  /** Integer tokens. Zero when the advertiser rejected the action. */
  reward: number;
  status: 'Approved' | 'Pending' | 'Rejected' | 'Reversed';
  /** Raw signed payload, retained for dispute resolution. */
  rawPayload: Record<string, unknown>;
  signatureValid: boolean;
  /** Set once the credit has actually been written to the user's balance, so a
      retry after a partial failure can tell the difference. */
  creditedAt: Timestamp | null;
  createdAt: Timestamp;
}

/* ----------------------------------------------------------- /config ----- */
/** Read-only to every authenticated client; written by a scheduled function
    that pulls from the pricing provider. */
export interface ConfigRatesDoc {
  /** USD value of one internal token. */
  usdPerToken: number;
  /** USD spot price per asset. */
  spot: Record<CoinTicker, number>;
  /** Per-asset, per-rail minimums and fees, so a client cannot be shown a
      stale minimum from a deploy six weeks ago. */
  rails: Array<{
    coin: CoinTicker;
    rail: PayoutRailName;
    network: string;
    min: string;
    fee: string;
    etaLabel: string;
    enabled: boolean;
  }>;
  updatedAt: Timestamp;
}

/* ----------------------------------------------------------------------------
   FIELD GROUPS
   Exported so both the app and the rules test suite can assert against the
   same list. If these drift from firestore.rules, the rules tests fail.
   -------------------------------------------------------------------------- */
export const USER_SERVER_ONLY_FIELDS = [
  'balance',
  'lockedBalance',
  'level',
  'exp',
  'totalEarned',
  'streakDays',
  'lastStreakClaimAt',
  'earningBonusBps',
  'referralCode',
  'referredBy',
  'referralTier',
  'commissionBps',
  'roles',
  'suspended',
  'suspendedReason',
  'createdAt',
] as const;

export const WITHDRAWAL_SERVER_ONLY_FIELDS = [
  'status',
  'txid',
  'batchId',
  'processedAt',
  'failureReason',
  'reviewedBy',
] as const;

export const CAMPAIGN_SERVER_ONLY_FIELDS = [
  'status',
  'viewsDelivered',
  'spendUsd',
  'reviewedAt',
  'reviewedBy',
  'rejectionReason',
] as const;
