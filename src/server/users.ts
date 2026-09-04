import 'server-only';

import { cache } from 'react';

import { referralUrl } from '@/lib/brand';
import {
  earningBonusBps,
  levelFromExp,
  tierForCount,
  type EconomyConfig,
} from '@/lib/config/economy';
import type { AppNotification, CoinTicker, UserProfile } from '@/lib/models';

import { getEconomy, getRates } from './config';
import { supabaseGetConfig, supabaseGetUser } from './data-supabase';
import { isSupabaseBackend } from '@/lib/backend';
import {
  AppError,
  FieldValue,
  Timestamp,
  bool,
  conflict,
  db,
  int,
  iso,
  isoOr,
  now,
  num,
  str,
} from './db';
import { initialsFor } from './session';
import { bumpStat } from './stats';

/* ============================================================================
   USERS
   ----------------------------------------------------------------------------
   `/users/{uid}` is created here, on the server, and never by the client — the
   document carries `balance`, `level`, `exp` and `referredBy`, and a client
   that could create its own would seed itself a balance. firestore.rules denies
   client creates on the collection outright; this module is the only writer.

   USERNAME UNIQUENESS
   Firestore has no unique index. Uniqueness is enforced by a second collection,
   `/usernames/{lowercased}`, holding the owning uid. The claim and the profile
   write happen in one transaction, so two simultaneous signups on the same
   handle cannot both succeed — the loser's `create` throws.

   COUNTRY
   Resolved from the CDN's geo header at signup, not from a form. A self-declared
   country on a payouts product is a field users lie in, and it is what the
   fraud rules and the referral geo map read.
   ========================================================================== */

export interface CreateUserInput {
  uid: string;
  email: string;
  username: string;
  /** Referral CODE (not uid) captured from the `?r=` parameter. */
  referralCode?: string | null;
  countryCode?: string | null;
  ip?: string | null;
}

const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'support', 'staff', 'moderator', 'mod', 'system',
  'vazionix', 'official', 'help', 'api', 'null', 'undefined', 'me', 'you', 'anonymous',
]);

export function assertUsername(username: string): string {
  const value = username.trim();
  if (!/^[a-zA-Z0-9_.]{3,20}$/.test(value)) {
    throw new AppError(
      'Usernames are 3–20 characters, letters, numbers, underscore or dot.',
      400,
      'invalid_username',
    );
  }
  if (RESERVED_USERNAMES.has(value.toLowerCase())) {
    throw new AppError('That username is reserved. Pick another.', 400, 'reserved_username');
  }
  return value;
}

/** URL-safe, non-sequential, collision-resistant referral code. */
function newReferralCode(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Create `/users/{uid}` if it does not exist. Idempotent: called on every
 * session mint, so a user whose signup half-failed is repaired on next sign-in
 * rather than being permanently broken.
 */
export async function ensureUser(input: CreateUserInput): Promise<{ created: boolean }> {
  const economy = await getEconomy();
  const userRef = db().doc(`users/${input.uid}`);
  const existing = await userRef.get();
  if (existing.exists) return { created: false };

  const username = assertUsername(input.username);
  const lower = username.toLowerCase();
  const nameRef = db().doc(`usernames/${lower}`);

  /* Resolve the referrer OUTSIDE the transaction: a query cannot be issued
     inside one after the first write, and the referrer document is immutable
     for our purposes (we only need its uid). */
  let referrerUid: string | null = null;
  if (input.referralCode) {
    const match = await db()
      .collection('users')
      .where('referralCode', '==', input.referralCode.trim())
      .limit(1)
      .get();
    const doc = match.docs[0];
    if (doc && doc.id !== input.uid) referrerUid = doc.id;
  }

  const referralCode = newReferralCode();
  const signupBonus = Math.max(0, int(economy.referrals.signupBonusTokens));

  await db().runTransaction(async (tx) => {
    const nameSnap = await tx.get(nameRef);
    if (nameSnap.exists && nameSnap.get('uid') !== input.uid) {
      throw conflict('That username is taken.', 'username_taken');
    }

    tx.set(nameRef, { uid: input.uid, username, createdAt: now() });

    tx.set(userRef, {
      username,
      usernameLower: lower,
      email: input.email,
      countryCode: (input.countryCode ?? 'XX').toUpperCase().slice(0, 2),
      avatarInitials: initialsFor(username),
      notificationPrefs: { email: true, withdrawals: true, referrals: true, promos: false },
      displayCurrency: 'USDT' as CoinTicker,

      balance: signupBonus,
      lockedBalance: 0,
      depositBalance: 0,
      level: 1,
      exp: 0,
      totalExp: 0,
      totalEarned: signupBonus,
      streakDays: 0,
      lastStreakClaimAt: null,
      earningBonusBps: earningBonusBps(1, 0, economy.levels),
      referralCode,
      referredBy: referrerUid,
      referralTier: economy.referrals.tiers[0]?.name ?? 'Bronze',
      commissionBps: (economy.referrals.tiers[0]?.rate ?? 5) * 100,
      referralCount: 0,
      referralQualified: 0,
      claimCounts: { faucet: 0, ptc: 0, shortlink: 0, offerwall: 0, referrals: 0, bonus: 0, challenge: 0 },
      roles: {},
      suspended: false,
      suspendedReason: null,
      signupIp: input.ip ?? null,
      lastSeenAt: now(),
      createdAt: now(),
      updatedAt: now(),
    });

    if (signupBonus > 0) {
      tx.create(db().collection(`users/${input.uid}/claims`).doc(), {
        source: 'bonus',
        amount: signupBonus,
        exp: 0,
        refId: 'signup',
        label: 'Welcome bonus',
        bonusBps: 0,
        ip: input.ip ?? null,
        userAgentHash: null,
        createdAt: now(),
        updatedAt: now(),
      });
    }

    /* The referral edge. Document id IS the referred uid, so the edge is unique
       by construction — nobody can be referred twice. */
    if (referrerUid) {
      tx.set(db().doc(`referrals/${referrerUid}/list/${input.uid}`), {
        username,
        countryCode: (input.countryCode ?? 'XX').toUpperCase().slice(0, 2),
        level: 1,
        totalEarned: 0,
        commissionPaid: 0,
        qualified: false,
        joinedAt: now(),
        lastActiveAt: now(),
        createdAt: now(),
        updatedAt: now(),
      });
      tx.update(db().doc(`users/${referrerUid}`), {
        referralCount: FieldValue.increment(1),
        updatedAt: now(),
      });
    }
  });

  await bumpStat({ members: 1, membersToday: 1 });

  await pushNotification(input.uid, {
    icon: 'coins',
    tone: 'mint',
    title: 'Welcome aboard',
    body: signupBonus
      ? `${signupBonus} tokens are already in your balance. Claim the faucet to keep going.`
      : 'Claim the faucet to make your first tokens.',
    href: '/faucet',
  });

  return { created: true };
}

/** Touch `lastSeenAt`, used by the online counter and the dormancy sweep. */
export async function touchUser(uid: string): Promise<void> {
  try {
    await db().doc(`users/${uid}`).update({ lastSeenAt: now() });
  } catch {
    // A missing document is repaired by ensureUser on the next session mint.
  }
}

/* ---- READ MODEL ---------------------------------------------------------- */

function profileFrom(
  uid: string,
  data: Record<string, unknown>,
  economy: EconomyConfig,
  usdPerToken: number,
  emailVerified: boolean,
): UserProfile {
  const totalExp = int(data.totalExp, int(data.exp));
  const { level, exp, expNext } = levelFromExp(totalExp, economy.levels);
  const streak = int(data.streakDays);
  const qualified = int(data.referralQualified);
  const { tier, rate } = tierForCount(qualified, economy.referrals);
  const bonusBps = int(data.earningBonusBps, earningBonusBps(level, streak, economy.levels));
  const counts = (data.claimCounts ?? {}) as Record<string, unknown>;
  const totalEarned = int(data.totalEarned);
  const referralCode = str(data.referralCode);
  const username = str(data.username, 'member');

  return {
    uid,
    username,
    email: str(data.email),
    emailVerified,
    initials: str(data.avatarInitials, initialsFor(username)),
    country: countryName(str(data.countryCode, 'XX')),
    countryCode: str(data.countryCode, 'XX'),
    level,
    exp,
    expNext,
    balance: int(data.balance),
    lockedBalance: int(data.lockedBalance),
    depositBalance: num(data.depositBalance),
    earningBonus: bonusBps / 100,
    totalEarned,
    totalEarnedUsd: totalEarned * usdPerToken,
    memberSince: isoOr(data.createdAt),
    streak,
    referralCode,
    referralLink: referralUrl(referralCode),
    commissionRate: rate,
    tier,
    claims: {
      faucet: int(counts.faucet),
      ptc: int(counts.ptc),
      shortlink: int(counts.shortlink),
      offerwall: int(counts.offerwall),
      referrals: qualified,
    },
    displayCurrency: (str(data.displayCurrency, 'USDT') as CoinTicker),
    suspended: bool(data.suspended),
    roles: (data.roles ?? {}) as UserProfile['roles'],
  };
}

/** The signed-in user's profile, memoised per request. */
export const getProfile = cache(async (uid: string, emailVerified = true): Promise<UserProfile | null> => {
  const economy = await getEconomy();
  const rates = await getRates();

  /* Supabase backend: read the user row and map snake_case -> the Firestore
     shape profileFrom() expects, so the read model is identical. */
  if (isSupabaseBackend) {
    const row = await supabaseGetUser(uid);
    if (!row) return null;
    const data: Record<string, unknown> = {
      ...row,
      totalExp: row.total_exp,
      streakDays: row.streak_days,
      earningBonusBps: row.earning_bonus_bps,
      referralQualified: row.referral_qualified,
      claimCounts: row.claim_counts,
      totalEarned: row.total_earned,
      referralCode: row.referral_code,
      username: row.username,
      email: row.email,
      avatarInitials: row.avatar_initials,
      countryCode: row.country_code,
      balance: row.balance,
      lockedBalance: row.locked_balance,
      depositBalance: row.deposit_balance,
      displayCurrency: row.display_currency,
      suspended: row.suspended,
      roles: row.roles,
      referralTier: row.referral_tier,
      commissionBps: row.commission_bps,
      createdAt: row.created_at,
    };
    return profileFrom(uid, data, economy, rates.usdPerToken, emailVerified);
  }

  const snap = await db().doc(`users/${uid}`).get();
  if (!snap.exists) return null;
  return profileFrom(uid, snap.data() as Record<string, unknown>, economy, rates.usdPerToken, emailVerified);
});

/** Public-facing slice of another user, for leaderboards and referral lists. */
export async function getPublicUser(uid: string): Promise<{ username: string; countryCode: string; level: number } | null> {
  const snap = await db().doc(`users/${uid}`).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    username: str(data.username, 'member'),
    countryCode: str(data.countryCode, 'XX'),
    level: int(data.level, 1),
  };
}

export async function updateProfileFields(
  uid: string,
  patch: { countryCode?: string; displayCurrency?: CoinTicker; notificationPrefs?: Record<string, boolean> },
): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: now() };
  if (patch.countryCode) update.countryCode = patch.countryCode.toUpperCase().slice(0, 2);
  if (patch.displayCurrency) update.displayCurrency = patch.displayCurrency;
  if (patch.notificationPrefs) update.notificationPrefs = patch.notificationPrefs;
  await db().doc(`users/${uid}`).update(update);
}

/** Rename, keeping `/usernames/{lower}` consistent in the same transaction. */
export async function changeUsername(uid: string, next: string): Promise<void> {
  const username = assertUsername(next);
  const lower = username.toLowerCase();
  const userRef = db().doc(`users/${uid}`);
  const nextRef = db().doc(`usernames/${lower}`);

  await db().runTransaction(async (tx) => {
    const [userSnap, nameSnap] = await Promise.all([tx.get(userRef), tx.get(nextRef)]);
    if (!userSnap.exists) throw new AppError('Profile not found.', 404, 'not_found');

    const currentLower = str(userSnap.get('usernameLower'));
    if (currentLower === lower) return;
    if (nameSnap.exists) throw conflict('That username is taken.', 'username_taken');

    tx.set(nextRef, { uid, username, createdAt: now() });
    if (currentLower) tx.delete(db().doc(`usernames/${currentLower}`));
    tx.update(userRef, {
      username,
      usernameLower: lower,
      avatarInitials: initialsFor(username),
      updatedAt: now(),
    });
  });
}

/* ---- NOTIFICATIONS ------------------------------------------------------- */

export async function pushNotification(
  uid: string,
  n: { icon: AppNotification['icon']; tone: AppNotification['tone']; title: string; body: string; href?: string | null },
): Promise<void> {
  try {
    await db().collection(`users/${uid}/notifications`).add({
      icon: n.icon,
      tone: n.tone,
      title: n.title,
      body: n.body,
      href: n.href ?? null,
      read: false,
      createdAt: now(),
      updatedAt: now(),
    });
  } catch (error) {
    // A notification is never worth failing the action that produced it.
    console.error('[notifications] write failed', error);
  }
}

export async function listNotifications(uid: string, limit = 20): Promise<AppNotification[]> {
  const snap = await db()
    .collection(`users/${uid}/notifications`)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      icon: (str(data.icon, 'coins') as AppNotification['icon']),
      tone: (str(data.tone, 'info') as AppNotification['tone']),
      title: str(data.title),
      body: str(data.body),
      href: data.href ? str(data.href) : null,
      at: isoOr(data.createdAt),
      unread: !bool(data.read),
    };
  });
}

export async function markNotificationsRead(uid: string): Promise<void> {
  const snap = await db()
    .collection(`users/${uid}/notifications`)
    .where('read', '==', false)
    .limit(400)
    .get();
  if (snap.empty) return;

  const batch = db().batch();
  for (const doc of snap.docs) batch.update(doc.ref, { read: true, updatedAt: now() });
  await batch.commit();
}

/* ---- SUSPENSION ---------------------------------------------------------- */

export function assertActive(data: Record<string, unknown>): void {
  if (bool(data.suspended)) {
    throw new AppError(
      str(data.suspendedReason) || 'This account is suspended. Open a ticket and support will review it.',
      403,
      'suspended',
    );
  }
}

/** Auto-lifting suspensions, checked on read so no scheduler is required. */
export async function liftExpiredSuspension(uid: string, data: Record<string, unknown>): Promise<boolean> {
  const until = data.suspendedUntil;
  if (!bool(data.suspended) || !until) return false;
  const untilMs = until instanceof Timestamp ? until.toMillis() : Date.parse(String(iso(until) ?? ''));
  if (!Number.isFinite(untilMs) || untilMs > Date.now()) return false;

  await db().doc(`users/${uid}`).update({
    suspended: false,
    suspendedReason: null,
    suspendedUntil: null,
    updatedAt: now(),
  });
  return true;
}

/* ---- COUNTRY NAMES -------------------------------------------------------- */

const COUNTRY_NAMES: Record<string, string> = {
  IN: 'India', US: 'United States', BR: 'Brazil', ID: 'Indonesia', NG: 'Nigeria',
  PH: 'Philippines', VN: 'Vietnam', EG: 'Egypt', UA: 'Ukraine', TH: 'Thailand',
  KE: 'Kenya', PK: 'Pakistan', BD: 'Bangladesh', RU: 'Russia', TR: 'Turkey',
  MX: 'Mexico', AR: 'Argentina', CO: 'Colombia', VE: 'Venezuela', PE: 'Peru',
  GB: 'United Kingdom', DE: 'Germany', FR: 'France', ES: 'Spain', IT: 'Italy',
  PL: 'Poland', NL: 'Netherlands', CA: 'Canada', AU: 'Australia', ZA: 'South Africa',
  MA: 'Morocco', DZ: 'Algeria', GH: 'Ghana', TZ: 'Tanzania', UG: 'Uganda',
  MY: 'Malaysia', SG: 'Singapore', JP: 'Japan', KR: 'South Korea', CN: 'China',
  IQ: 'Iraq', IR: 'Iran', SA: 'Saudi Arabia', AE: 'United Arab Emirates', NP: 'Nepal',
  LK: 'Sri Lanka', MM: 'Myanmar', KH: 'Cambodia', UZ: 'Uzbekistan', KZ: 'Kazakhstan',
  RO: 'Romania', RS: 'Serbia', GR: 'Greece', PT: 'Portugal', SE: 'Sweden',
};

export const countryName = (code: string): string =>
  COUNTRY_NAMES[code.toUpperCase()] ?? (code === 'XX' ? 'Unknown' : code.toUpperCase());
