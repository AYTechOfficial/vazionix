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
import { supabaseGetUser } from './data-supabase';
import {
  AppError,
  bool,
  conflict,
  int,
  iso,
  isoOr,
  num,
  str,
} from './db';
import { initialsFor } from './session';
import { bumpStat } from './stats';

/* ============================================================================
   USERS
   ----------------------------------------------------------------------------
   The `users` row is created by the `handle_new_user` auth trigger, and this
   module only repairs gaps (a profile missing when the first session asks for
   one). The row carries `balance`, `level`, `exp` and `referred_by`, and a
   client that could create its own would seed itself a balance — RLS denies
   client writes outright.

   USERNAME UNIQUENESS
   Enforced two ways: a unique index on `users.username_lower` and a
   `usernames` table holding the owning uid. Two simultaneous signups on the
   same handle cannot both succeed — the loser's insert throws 23505 and the
   register form turns it into a clean "taken" message.

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
 * Confirm the profile row exists for the signed-in auth user, and repair it if
 * the auth trigger ever missed (e.g. a user created while the trigger was being
 * deployed). Profile creation itself lives in the `handle_new_user` DB trigger
 * (migration 0011/0019): username generation, referral wiring, the signup
 * bonus and its ledger row all happen inside Postgres, where two simultaneous
 * signups on one handle cannot both succeed.
 */
export async function ensureUser(input: CreateUserInput): Promise<{ created: boolean }> {
  const { supabaseGetUser } = await import('./data-supabase');
  const existing = await supabaseGetUser(input.uid);
  if (existing) return { created: false };

  /* Repair path: insert the minimum row the trigger would have written. The
     unique constraints arbitrate the username; a collision means the caller
     picks again (the login page routes to a rename flow). */
  const economy = await getEconomy();
  const username = assertUsername(input.username);
  const lower = username.toLowerCase();
  const signupBonus = Math.max(0, int(economy.referrals.signupBonusTokens));

  const { getServerSupabase } = await import('./supabase');
  const { error } = await getServerSupabase().from('users').upsert(
    {
      id: input.uid,
      auth_id: input.uid,
      username,
      username_lower: lower,
      email: input.email,
      country_code: (input.countryCode ?? 'XX').toUpperCase().slice(0, 2),
      avatar_initials: initialsFor(username),
      balance: signupBonus,
      total_earned: signupBonus,
      referral_code: newReferralCode(),
      claim_counts: { faucet: 0, ptc: 0, shortlink: 0, offerwall: 0, referrals: 0, bonus: 0, challenge: 0 },
      roles: {},
      suspended: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error && error.code !== '23505') {
    console.error('[users] profile repair failed', error);
    return { created: false };
  }
  if (error?.code === '23505') {
    /* Username collision on repair: keep the auth account usable by deriving
       a unique handle from the auth uuid suffix. */
    const fallback = `user${input.uid.replace(/-/g, '').slice(0, 10)}`;
    await getServerSupabase().from('users').upsert(
      {
        id: input.uid,
        auth_id: input.uid,
        username: fallback,
        username_lower: fallback,
        email: input.email,
        referral_code: newReferralCode(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );
  }

  await bumpStat({ members: 1, membersToday: 1 });
  return { created: true };
}

/** Touch `last_seen_at`, used by the online counter and the dormancy sweep. */
export async function touchUser(uid: string): Promise<void> {
  try {
    const { supabaseTouchUser } = await import('./data-supabase');
    await supabaseTouchUser(uid);
  } catch {
    // A missing row is repaired by the signup trigger on the next sign-in.
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

  let row: Record<string, unknown> | null;
  try {
    row = await supabaseGetUser(uid);
  } catch {
    // Supabase not configured yet -> no profile, treat as signed-out.
    return null;
  }
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
});

/** Public-facing slice of another user, for leaderboards and referral lists. */
export async function getPublicUser(uid: string): Promise<{ username: string; countryCode: string; level: number } | null> {
  const { supabaseGetUser } = await import('./data-supabase');
  const row = await supabaseGetUser(uid);
  if (!row) return null;
  return {
    username: str(row.username, 'member'),
    countryCode: str(row.country_code, 'XX'),
    level: int(row.level, 1),
  };
}

export async function updateProfileFields(
  uid: string,
  patch: { countryCode?: string; displayCurrency?: CoinTicker; notificationPrefs?: Record<string, boolean> },
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.countryCode) update.country_code = patch.countryCode.toUpperCase().slice(0, 2);
  if (patch.displayCurrency) update.display_currency = patch.displayCurrency;
  if (patch.notificationPrefs) update.notification_prefs = patch.notificationPrefs;

  const { getServerSupabase } = await import('./supabase');
  const { error } = await getServerSupabase().from('users').update(update).eq('id', uid);
  if (error) throw error;
}

/** Rename, keeping the username uniqueness constraint satisfied. Postgres
    enforces uniqueness on username_lower, so the rename either lands or throws
    a 23505 that the route maps to "taken". */
export async function changeUsername(uid: string, next: string): Promise<void> {
  const username = assertUsername(next);
  const lower = username.toLowerCase();

  const { supabaseGetUser } = await import('./data-supabase');
  const { getServerSupabase } = await import('./supabase');
  const row = await supabaseGetUser(uid);
  if (!row) throw new AppError('Profile not found.', 404, 'not_found');
  if (row.username_lower === lower) return;

  const { error } = await getServerSupabase()
    .from('users')
    .update({
      username,
      username_lower: lower,
      avatar_initials: initialsFor(username),
      updated_at: new Date().toISOString(),
    })
    .eq('id', uid);
  if (error) {
    if (error.code === '23505') throw conflict('That username is taken.', 'username_taken');
    throw error;
  }

  /* Keep the usernames ownership table in step. Best-effort: the users table
     constraint is the source of truth for uniqueness. */
  try {
    const client = getServerSupabase();
    if (row.username_lower) {
      await client.from('usernames').delete().eq('username_lower', row.username_lower);
    }
    await client.from('usernames').insert({ username, username_lower: lower, user_id: uid });
  } catch (error) {
    console.error('[users] usernames mirror failed', error);
  }
}

/* ---- NOTIFICATIONS ------------------------------------------------------- */

export async function pushNotification(
  uid: string,
  n: { icon: AppNotification['icon']; tone: AppNotification['tone']; title: string; body: string; href?: string | null },
): Promise<void> {
  try {
    const { supabaseInsertNotification } = await import('./data-supabase');
    await supabaseInsertNotification(uid, {
      icon: n.icon,
      tone: n.tone,
      title: n.title,
      body: n.body,
      href: n.href ?? null,
      read: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    // A notification is never worth failing the action that produced it.
    console.error('[notifications] write failed', error);
  }
}

export async function listNotifications(uid: string, limit = 20): Promise<AppNotification[]> {
  const { supabaseListNotifications } = await import('./data-supabase');
  const rows = await supabaseListNotifications(uid, limit);
  return rows.map((d: Record<string, unknown>) => ({
    id: String(d.id ?? ''),
    icon: (String(d.icon ?? 'coins') as AppNotification['icon']),
    tone: (String(d.tone ?? 'info') as AppNotification['tone']),
    title: String(d.title ?? ''),
    body: String(d.body ?? ''),
    href: d.href ? String(d.href) : null,
    at: d.created_at ? new Date(String(d.created_at)).toISOString() : new Date().toISOString(),
    unread: !d.read,
  }));
}

export async function markNotificationsRead(uid: string): Promise<void> {
  const { supabaseMarkNotificationsRead } = await import('./data-supabase');
  await supabaseMarkNotificationsRead(uid);
}

/* ---- SUSPENSION ---------------------------------------------------------- */

export function assertActive(data: Record<string, unknown>): void {
  if (bool(data.suspended)) {
    throw new AppError(
      str(data.suspendedReason ?? data.suspended_reason) ||
      'This account is suspended. Open a ticket and support will review it.',
      403,
      'suspended',
    );
  }
}

/** Auto-lifting suspensions, checked on read so no scheduler is required. */
export async function liftExpiredSuspension(uid: string, data: Record<string, unknown>): Promise<boolean> {
  const until = data.suspendedUntil ?? data.suspended_until;
  if (!bool(data.suspended) || !until) return false;
  const untilMs = Date.parse(String(iso(until) ?? ''));
  if (!Number.isFinite(untilMs) || untilMs > Date.now()) return false;

  const { getServerSupabase } = await import('./supabase');
  await getServerSupabase().from('users').update({
    suspended: false,
    suspended_reason: null,
    suspended_until: null,
    updated_at: new Date().toISOString(),
  }).eq('id', uid);
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
