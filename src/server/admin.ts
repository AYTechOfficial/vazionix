import 'server-only';

import type {
  CoinTicker,
  PayoutRailName,
  WithdrawalRecord,
  WithdrawalStatus,
} from '@/lib/models';

import { getRates } from './config';
import {
  bool,
  int,
  iso,
  isoOr,
  str,
} from './db';
import { getDailySeries, getLiabilityUsd, getPlatformStats, type DailyStatRow } from './stats';
import { pendingPayoutTotal, railStatus } from './payouts';

/* ============================================================================
   ADMIN DATA
   ----------------------------------------------------------------------------
   Every read and write the staff console makes, against Postgres through the
   service-role client. Each function answers with what is actually in the
   database — including "nothing yet", which is the correct answer for a fresh
   install.

   PAGINATION IS CURSOR-BASED
   `created_at < last-seen`, not `offset`. The user table grows without bound
   and an offset scan walks every skipped row on every page.

   AGGREGATES USE count()
   Row counts come from PostgREST's `count: 'exact'` head requests.
   ========================================================================== */

/* ---- COMMAND CENTRE ------------------------------------------------------- */

export interface AdminOverview {
  members: number;
  membersToday: number;
  onlineNow: number;
  claimsToday: number;
  tokensCreditedAllTime: number;
  withdrawalsToday: number;
  paidOutUsd: number;
  liabilityUsd: number;
  liabilityTokens: number;
  pendingPayouts: { count: number; usd: number; tokens: number };
  openTickets: number;
  heldForReview: number;
  suspendedUsers: number;
  rails: Record<PayoutRailName, { automated: boolean; configured: boolean }>;
  series: DailyStatRow[];
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const [stats, liability, pending, series, openTickets, held, suspended] = await Promise.all([
    getPlatformStats(),
    getLiabilityUsd(),
    pendingPayoutTotal(),
    getDailySeries(30),
    countWhere('tickets', [['status', '==', 'Open']]),
    countWhere('withdrawals', [['status', '==', 'HeldForReview']]),
    countWhere('users', [['suspended', '==', true]]),
  ]);

  return {
    members: stats.members,
    membersToday: stats.membersToday,
    onlineNow: stats.onlineNow,
    claimsToday: stats.claimsToday,
    tokensCreditedAllTime: stats.tokensPaidAllTime,
    withdrawalsToday: stats.withdrawalsToday,
    paidOutUsd: stats.paidOutUsd,
    liabilityUsd: liability.usd,
    liabilityTokens: liability.tokens,
    pendingPayouts: pending,
    openTickets,
    heldForReview: held,
    suspendedUsers: suspended,
    rails: railStatus(),
    series,
  };
}

type Filter = [string, '==' | '>=' | '<=' | 'in' | '>' | '<', unknown];

/** Logical collection name (what the pages pass) -> actual table. */
const TABLE_FOR: Record<string, string> = {
  ptcAds: 'ptc_ads',
  offerwallProviders: 'offerwall_providers',
  offerwallConversions: 'offerwall_conversions',
  lotteryTickets: 'lottery_tickets',
  lotteryRounds: 'lottery_rounds',
  leaderboards: 'leaderboard_entries',
  adUnits: 'ad_units',
  auditLog: 'audit_log',
};

/** camelCase field the pages filter on -> snake_case column. */
const COLUMN_FOR: Record<string, string> = {
  uid: 'user_id',
  lastMessageAt: 'last_message_at',
  createdAt: 'created_at',
  processedAt: 'processed_at',
  tokenCost: 'token_cost',
  countryCode: 'country_code',
  emailVerified: 'email_verified',
  unreadForSupport: 'unread_for_support',
  suspendedUntil: 'suspended_until',
  status: 'status',
  suspended: 'suspended',
  enabled: 'enabled',
  source: 'source',
};

export async function countWhere(collection: string, filters: Filter[] = []): Promise<number> {
  /* The console's counts use equality and IN only, which map cleanly onto a
     Postgres count. An unsupported operator returns 0 and LOGS, rather than
     quietly producing a wrong number on a screen used to make decisions. */
  try {
    const { supabaseCountWhere } = await import('./data-supabase');
    const table = TABLE_FOR[collection] ?? collection;
    const mapped: Array<[string, '==' | 'in', unknown]> = [];
    for (const [field, op, value] of filters) {
      if (op !== '==' && op !== 'in') {
        console.error(`[admin] countWhere: unsupported operator ${op} on ${table}.${field}`);
        return 0;
      }
      mapped.push([COLUMN_FOR[field] ?? field, op, value]);
    }
    return await supabaseCountWhere(table, mapped);
  } catch (error) {
    console.error(`[admin] count on ${collection} failed`, error);
    return 0;
  }
}

/* ---- USERS ---------------------------------------------------------------- */

export interface AdminUserRow {
  uid: string;
  username: string;
  email: string;
  countryCode: string;
  level: number;
  balance: number;
  lockedBalance: number;
  totalEarned: number;
  referralCount: number;
  suspended: boolean;
  emailVerified: boolean;
  roles: Record<string, boolean>;
  createdAt: string;
  lastSeenAt: string | null;
  riskScore: number;
}

/**
 * A crude, explainable risk score. Deliberately not machine-learned: an admin
 * suspending an account needs to be able to say why, and "0.7 from the model" is
 * not a reason anybody can defend in a support reply.
 */
function riskScore(data: Record<string, unknown>): number {
  let score = 0;
  const created = iso(data.createdAt);
  const ageDays = created ? (Date.now() - Date.parse(created)) / 86_400_000 : 999;

  if (ageDays < 1) score += 25;
  else if (ageDays < 7) score += 10;

  const earned = int(data.totalEarned);
  if (ageDays > 0 && earned / Math.max(1, ageDays) > 20_000) score += 30;

  if (!bool(data.emailVerified, true)) score += 15;
  if (str(data.countryCode, 'XX') === 'XX') score += 10;
  if (int(data.referralCount) > 50 && int(data.referralQualified) === 0) score += 20;
  if (bool(data.suspended)) score += 40;

  return Math.min(100, score);
}

function userRow(uid: string, data: Record<string, unknown>): AdminUserRow {
  return {
    uid,
    username: str(data.username, 'member'),
    email: str(data.email),
    countryCode: str(data.countryCode, 'XX'),
    level: int(data.level, 1),
    balance: int(data.balance),
    lockedBalance: int(data.lockedBalance),
    totalEarned: int(data.totalEarned),
    referralCount: int(data.referralCount),
    suspended: bool(data.suspended),
    emailVerified: bool(data.emailVerified, true),
    roles: (data.roles ?? {}) as Record<string, boolean>,
    createdAt: isoOr(data.createdAt),
    lastSeenAt: iso(data.lastSeenAt),
    riskScore: riskScore(data),
  };
}

export interface UserPage {
  rows: AdminUserRow[];
  cursor: string | null;
  total: number;
}

export async function listUsers(options: {
  limit?: number;
  cursor?: string | null;
  search?: string | null;
  suspended?: boolean;
  sort?: 'createdAt' | 'balance' | 'totalEarned' | 'level';
} = {}): Promise<UserPage> {
  const limit = Math.min(100, Math.max(5, options.limit ?? 25));
  const search = options.search?.trim().toLowerCase();

  const { getServerSupabase } = await import('./supabase');
  const supabase = getServerSupabase();
  const sortColumn =
    options.sort === 'balance' ? 'balance'
    : options.sort === 'totalEarned' ? 'total_earned'
    : options.sort === 'level' ? 'level'
    : 'created_at';

  let q = supabase.from('users').select('*', { count: 'exact' });

  /* Postgres CAN do substring search, so the console's search box actually
     matches anywhere in the handle or email rather than prefix-only. */
  if (search) {
    const safe = search.replace(/[%,()]/g, '');
    q = q.or(`username_lower.ilike.%${safe}%,email.ilike.%${safe}%`);
  }
  if (options.suspended !== undefined) q = q.eq('suspended', options.suspended);
  if (options.cursor) q = q.lt('created_at', options.cursor);

  const { data, count, error } = await q
    .order(sortColumn, { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[admin] user list failed', error);
    return { rows: [], cursor: null, total: 0 };
  }

  const rows = (data ?? []).map((r) =>
    userRow(String(r.id), {
      ...r,
      usernameLower: r.username_lower,
      countryCode: r.country_code,
      lockedBalance: r.locked_balance,
      totalEarned: r.total_earned,
      referralCount: r.referral_qualified,
      referralQualified: r.referral_qualified,
      emailVerified: r.email_verified,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
    } as Record<string, unknown>),
  );
  const last = rows[rows.length - 1];
  return { rows, cursor: rows.length >= limit && last ? last.createdAt : null, total: count ?? rows.length };
}

export interface AdminUserDetail extends AdminUserRow {
  referralCode: string;
  referredBy: string | null;
  referralTier: string;
  commissionBps: number;
  earningBonusBps: number;
  streakDays: number;
  claimCounts: Record<string, number>;
  suspendedReason: string | null;
  signupIp: string | null;
  recentClaims: Array<{ id: string; source: string; amount: number; label: string; at: string }>;
  withdrawals: WithdrawalRecord[];
  referrals: Array<{ uid: string; username: string; level: number; qualified: boolean; joined: string }>;
  tickets: Array<{ id: string; subject: string; status: string; updated: string }>;
}

export async function getUserDetail(uid: string): Promise<AdminUserDetail | null> {
  const {
    supabaseGetUser,
    supabaseListClaims,
    supabaseListWithdrawals,
    supabaseListReferrals,
    supabaseListUserTickets,
  } = await import('./data-supabase');

  const row = await supabaseGetUser(uid);
  if (!row) return null;
  const u = row as Record<string, unknown>;

  const [claimRows, wdRows, refRows, ticketRows] = await Promise.all([
    supabaseListClaims(uid, { limit: 50, source: null, cursorIso: null }),
    supabaseListWithdrawals(uid, 25),
    supabaseListReferrals(uid, 50),
    supabaseListUserTickets(uid, 20),
  ]);

  const data: Record<string, unknown> = {
    ...u,
    usernameLower: u.username_lower,
    countryCode: u.country_code,
    lockedBalance: u.locked_balance,
    totalEarned: u.total_earned,
    referralCount: u.referral_qualified,
    referralQualified: u.referral_qualified,
    emailVerified: u.email_verified,
    createdAt: u.created_at,
    lastSeenAt: u.last_seen_at,
    referralCode: u.referral_code,
    referredBy: u.referred_by,
    referralTier: u.referral_tier,
    commissionBps: u.commission_bps,
    earningBonusBps: u.earning_bonus_bps,
    streakDays: u.streak_days,
    claimCounts: u.claim_counts,
    suspendedReason: u.suspended_reason,
    signupIp: u.signup_ip,
  };

  return {
    ...userRow(uid, data),
    referralCode: str(data.referralCode),
    referredBy: data.referredBy ? String(data.referredBy) : null,
    referralTier: str(data.referralTier, 'Bronze'),
    commissionBps: int(data.commissionBps),
    earningBonusBps: int(data.earningBonusBps),
    streakDays: int(data.streakDays),
    claimCounts: (data.claimCounts ?? {}) as Record<string, number>,
    suspendedReason: data.suspendedReason ? String(data.suspendedReason) : null,
    signupIp: data.signupIp ? String(data.signupIp) : null,
    recentClaims: claimRows.slice(0, 50).map((c) => ({
      id: String(c.id ?? ''),
      source: String(c.source ?? ''),
      amount: Number(c.amount ?? 0),
      label: String(c.label ?? c.ref_id ?? c.source ?? ''),
      at: c.created_at ? new Date(c.created_at as string).toISOString() : new Date().toISOString(),
    })),
    withdrawals: wdRows.map((r) =>
      adminWithdrawalRow(String(r.id), {
        ...r, uid: r.user_id, countryCode: r.country_code, receiveAmount: r.receive_amount,
        tokenCost: r.token_cost, createdAt: r.created_at, processedAt: r.processed_at,
        failureReason: r.failure_reason, reviewedBy: r.reviewed_by,
        usdValue: String((Number(r.quoted_usd_per_unit ?? 0) || 0) * (Number(r.amount ?? 0) || 0)),
      } as Record<string, unknown>),
    ),
    referrals: refRows.map((d) => ({
      uid: String(d.referred_user_id ?? ''),
      username: String(d.username ?? 'member'),
      level: Number(d.level ?? 1),
      qualified: d.qualified === true,
      joined: d.joined_at ? new Date(d.joined_at as string).toISOString() : new Date().toISOString(),
    })),
    tickets: ticketRows.map((t) => ({
      id: String(t.id ?? ''),
      subject: String(t.subject ?? 'Support'),
      status: String(t.status ?? 'Open'),
      updated: t.last_message_at ? new Date(t.last_message_at as string).toISOString() : new Date().toISOString(),
    })),
  };
}

/* ---- WITHDRAWALS --------------------------------------------------------- */

export interface AdminWithdrawalRow extends WithdrawalRecord {
  uid: string;
  username: string;
  email: string;
  countryCode: string;
  usdValue: number;
  reviewedBy: string | null;
  ip: string | null;
}

function adminWithdrawalRow(id: string, data: Record<string, unknown>): AdminWithdrawalRow {
  return {
    id,
    uid: str(data.uid),
    username: str(data.username, 'member'),
    email: str(data.email),
    countryCode: str(data.countryCode, 'XX'),
    coin: (str(data.coin, 'USDT') as CoinTicker),
    rail: (str(data.rail, 'FaucetPay') as PayoutRailName),
    network: str(data.network),
    address: str(data.address),
    amount: str(data.amount, '0'),
    fee: str(data.fee, '0'),
    receiveAmount: str(data.receiveAmount, str(data.amount, '0')),
    tokenCost: int(data.tokenCost),
    status: (str(data.status, 'Pending') as WithdrawalStatus),
    txid: data.txid ? str(data.txid) : null,
    at: isoOr(data.createdAt),
    processedAt: iso(data.processedAt),
    failureReason: data.failureReason ? str(data.failureReason) : null,
    usdValue: Number(str(data.usdValue, '0')) || 0,
    reviewedBy: data.reviewedBy ? str(data.reviewedBy) : null,
    ip: data.ip ? str(data.ip) : null,
  };
}

export async function listWithdrawalQueue(options: {
  status?: WithdrawalStatus | 'queue' | 'all';
  limit?: number;
  cursor?: string | null;
} = {}): Promise<{ rows: AdminWithdrawalRow[]; cursor: string | null; total: number }> {
  const limit = Math.min(100, Math.max(5, options.limit ?? 25));
  const status = options.status ?? 'queue';

  const { supabaseWithdrawalsByStatus, supabaseCountWhere } = await import('./data-supabase');
  const statuses =
    status === 'queue' ? ['Pending', 'HeldForReview', 'Processing']
    : status === 'all' ? ['Pending', 'HeldForReview', 'Processing', 'Completed', 'Rejected', 'Failed', 'Reversed']
    : [status];

  try {
    const [rows, total] = await Promise.all([
      supabaseWithdrawalsByStatus(statuses, limit),
      supabaseCountWhere('withdrawals', [['status', 'in', statuses]]),
    ]);

    return {
      rows: rows.map((r) =>
        adminWithdrawalRow(String(r.id), {
          ...r,
          uid: r.user_id,
          countryCode: r.country_code,
          receiveAmount: r.receive_amount,
          tokenCost: r.token_cost,
          createdAt: r.created_at,
          processedAt: r.processed_at,
          failureReason: r.failure_reason,
          reviewedBy: r.reviewed_by,
          /* No denormalised usdValue on the Postgres row: derive from the quote
             the user was shown, so the console total matches their receipt. */
          usdValue: String((Number(r.quoted_usd_per_unit ?? 0) || 0) * (Number(r.amount ?? 0) || 0)),
        } as Record<string, unknown>),
      ),
      cursor: null,
      total,
    };
  } catch (error) {
    console.error('[admin] withdrawal queue failed', error);
    return { rows: [], cursor: null, total: 0 };
  }
}

/* ---- MODERATION ---------------------------------------------------------- */

export async function suspendUser(
  uid: string,
  reason: string,
  actorUid: string,
  untilIso?: string | null,
): Promise<void> {
  const { getServerSupabase } = await import('./supabase');
  const { error } = await getServerSupabase().from('users').update({
    suspended: true, suspended_reason: reason,
    suspended_until: untilIso ?? null, suspended_by: actorUid,
    suspended_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', uid);
  if (error) throw error;
  await writeAudit({ actorUid, action: 'user.suspend', target: uid, detail: reason });
}

export async function unsuspendUser(uid: string, actorUid: string): Promise<void> {
  const { getServerSupabase } = await import('./supabase');
  const { error } = await getServerSupabase().from('users').update({
    suspended: false, suspended_reason: null, suspended_until: null,
    updated_at: new Date().toISOString(),
  }).eq('id', uid);
  if (error) throw error;
  await writeAudit({ actorUid, action: 'user.unsuspend', target: uid, detail: '' });
}

/**
 * Manual balance adjustment. Goes through the ledger like everything else, so an
 * adjustment appears in the user's own transaction history rather than as an
 * unexplained balance change — which is the difference between a correction and
 * a mystery.
 */
export async function adjustBalance(args: {
  uid: string;
  tokens: number;
  reason: string;
  actorUid: string;
}): Promise<{ balance: number }> {
  const tokens = Math.trunc(args.tokens);
  if (!tokens) return { balance: 0 };

  const { credit, debit } = await import('./ledger');
  const idempotencyKey = `adj_${Date.now()}_${args.actorUid.slice(0, 8)}`;

  const result =
    tokens > 0
      ? await credit({
          uid: args.uid,
          source: 'adjustment',
          amount: tokens,
          label: `Adjustment — ${args.reason}`,
          refId: args.actorUid,
          idempotencyKey,
          applyBonus: false,
          score: false,
        })
      : await debit({
          uid: args.uid,
          amount: Math.abs(tokens),
          source: 'adjustment',
          label: `Adjustment — ${args.reason}`,
          refId: args.actorUid,
          idempotencyKey,
        });

  await writeAudit({
    actorUid: args.actorUid,
    action: 'money.adjust',
    target: args.uid,
    detail: `${tokens > 0 ? '+' : ''}${tokens} tokens — ${args.reason}`,
  });

  return { balance: result.balance };
}

/* ---- AUDIT LOG ----------------------------------------------------------- */

export interface AuditRow {
  id: string;
  actorUid: string;
  actorName: string;
  action: string;
  target: string;
  detail: string;
  at: string;
}

export async function writeAudit(entry: {
  actorUid: string;
  action: string;
  target: string;
  detail: string;
  actorName?: string;
}): Promise<void> {
  try {
    const { supabaseInsertAudit } = await import('./data-supabase');
    await supabaseInsertAudit({
      actorUid: entry.actorUid,
      actorName: entry.actorName,
      action: entry.action,
      target: entry.target,
      detail: entry.detail,
    });
  } catch (error) {
    console.error('[admin] audit write failed', error);
  }
}

/* `cursor` is kept in the signature so callers stay shape-compatible with the
   paged database reader; the Supabase reader pages by `at` from the page tail. */
export async function listAudit(limit = 50, _cursor?: string | null): Promise<{ rows: AuditRow[]; cursor: string | null }> {
  const { supabaseListAudit } = await import('./data-supabase');
  const rows = await supabaseListAudit(limit + 1);
  const page = rows.slice(0, limit).map((r) => {
    const raw = r.detail;
    let detail = '';
    if (typeof raw === 'string') {
      try { detail = JSON.parse(raw); } catch { detail = raw; }
    }
    return {
      id: String(r.id ?? ''),
      actorUid: String(r.actor_uid ?? ''),
      actorName: String(r.actor_name ?? r.actor_uid ?? ''),
      action: String(r.action ?? ''),
      target: String(r.target ?? ''),
      detail: String(detail ?? ''),
      at: r.created_at ? new Date(r.created_at as string).toISOString() : new Date().toISOString(),
    };
  });
  const last = rows[limit - 1];
  const lastAt = last?.created_at ? new Date(last.created_at as string).toISOString() : null;
  return { rows: page, cursor: rows.length > limit ? lastAt : null };
}

/* ---- AD INVENTORY -------------------------------------------------------- */

export interface AdUnitRow {
  placement: string;
  kind: string;
  network: string;
  enabled: boolean;
  hasPayload: boolean;
  capPerSession: number;
  updatedAt: string | null;
}

export async function listAdUnits(): Promise<AdUnitRow[]> {
  const { supabaseListAdUnits } = await import('./data-supabase');
  const rows = await supabaseListAdUnits();
  return rows.map((r) => ({
    placement: String(r.placement_id ?? ''),
    kind: str(r.kind, 'html'),
    network: str(r.network, '—'),
    enabled: bool(r.enabled, true),
    hasPayload: Boolean(r.html || r.src),
    capPerSession: int(r.cap_per_session),
    updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
  }));
}

/**
 * The ad_units table keeps its own columns for the scalar fields and parks the
 * rest of the editor payload (format, containerId, geo targeting, url) in the
 * `json` text column as a JSON string — the renderer reads it back through
 * getAdConfig.
 */
export async function saveAdUnit(
  placement: string,
  patch: Record<string, unknown>,
  actorUid: string,
): Promise<void> {
  const { supabaseSaveAdUnit } = await import('./data-supabase');
  const { kind, enabled, src, html, network, capPerSession, format, containerId, url, geo, ...rest } = patch;

  const json: Record<string, unknown> = {};
  if (format) json.format = format;
  if (containerId) json.containerId = containerId;
  if (url) json.url = url;
  if (Array.isArray(geo)) json.geo = geo;
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== null) json[key] = value;
  }

  await supabaseSaveAdUnit(placement, {
    ...(kind !== undefined ? { kind: String(kind) } : {}),
    ...(enabled !== undefined ? { enabled: enabled !== false } : {}),
    ...(src !== undefined ? { src: String(src ?? '') } : {}),
    ...(html !== undefined ? { html: String(html ?? '') } : {}),
    ...(network !== undefined ? { network: String(network ?? '') } : {}),
    ...(capPerSession !== undefined ? { cap_per_session: int(capPerSession) } : {}),
    ...(Object.keys(json).length ? { json: JSON.stringify(json) } : {}),
  });
  await writeAudit({
    actorUid,
    action: 'ads.unit.save',
    target: placement,
    detail: `kind=${str(patch.kind, 'html')} enabled=${patch.enabled !== false}`,
  });
}

export async function deleteAdUnit(placement: string, actorUid: string): Promise<void> {
  const { supabaseDeleteAdUnit } = await import('./data-supabase');
  await supabaseDeleteAdUnit(placement);
  await writeAudit({ actorUid, action: 'ads.unit.delete', target: placement, detail: '' });
}

/* ---- MODULE CATALOGUES (PTC, shortlinks, challenges, offerwall) ----------
   Logical names -> actual tables. The write path is permission-gated by the
   route's whitelist; this map only translates names. */

const CATALOGUE_TABLE: Record<string, string> = {
  ptcAds: 'ptc_ads',
  shortlinks: 'shortlinks',
  challenges: 'challenges',
  offerwallProviders: 'offerwall_providers',
  coupons: 'coupons',
  faq: 'faq',
  legal: 'legal',
  broadcasts: 'broadcasts',
};

export interface CatalogueRow {
  id: string;
  enabled: boolean;
  fields: Record<string, unknown>;
  updatedAt: string | null;
}

export async function listCatalogue(collection: string, limit = 200): Promise<CatalogueRow[]> {
  const table = CATALOGUE_TABLE[collection];
  if (!table) return [];
  const { supabaseListCatalogue } = await import('./data-supabase');
  return supabaseListCatalogue(table, limit);
}

/** camelCase editor field -> snake_case column, per catalogue. */
const CATALOGUE_COLUMN: Record<string, Record<string, string>> = {
  ptc_ads: { targetUrl: 'target_url', cooldownHours: 'cooldown_hours', dailyCap: 'daily_cap' },
  shortlinks: { targetUrl: 'target_url', cooldownHours: 'cooldown_hours' },
  challenges: {},
  offerwall_providers: { urlTemplate: 'url_template' },
  coupons: { maxRedemptions: 'max_redemptions', expiresAt: 'expires_at' },
  faq: {},
  legal: { effectiveAt: 'effective_at' },
  broadcasts: { sentAt: 'sent_at' },
};

export async function upsertCatalogueItem(
  collection: string,
  id: string | null,
  fields: Record<string, unknown>,
  actorUid: string,
): Promise<string> {
  const table = CATALOGUE_TABLE[collection];
  if (!table) throw new Error(`Unknown catalogue "${collection}".`);

  /* Translate the editor's camelCase payload into snake_case columns and drop
     server-managed keys the client must never set. */
  const map = CATALOGUE_COLUMN[table] ?? {};
  const columned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'createdAt' || key === 'updatedAt' || key === 'updatedBy') continue;
    columned[map[key] ?? key] = value;
  }

  const { supabaseUpsertCatalogue } = await import('./data-supabase');
  const rowId = await supabaseUpsertCatalogue(table, id, columned);
  await writeAudit({
    actorUid,
    action: `${collection}.upsert`,
    target: rowId,
    detail: str(fields.title ?? fields.name, rowId),
  });
  return rowId;
}

export async function deleteCatalogueItem(
  collection: string,
  id: string,
  actorUid: string,
): Promise<void> {
  const table = CATALOGUE_TABLE[collection];
  if (!table) throw new Error(`Unknown catalogue "${collection}".`);
  const { supabaseDeleteCatalogue } = await import('./data-supabase');
  await supabaseDeleteCatalogue(table, id);
  await writeAudit({ actorUid, action: `${collection}.delete`, target: id, detail: '' });
}

/* ---- CONFIG WRITES ------------------------------------------------------- */

export async function saveConfig(
  section: 'economy' | 'rates' | 'ads' | 'site',
  patch: Record<string, unknown>,
  actorUid: string,
): Promise<void> {
  const { supabaseUpsertConfig } = await import('./data-supabase');
  await supabaseUpsertConfig(section, patch);
  await writeAudit({
    actorUid,
    action: `config.${section}.save`,
    target: section,
    detail: Object.keys(patch).join(', '),
  });
}

/* ---- SUPPORT ------------------------------------------------------------- */

export interface AdminTicketRow {
  id: string;
  uid: string;
  username: string;
  subject: string;
  category: string;
  status: string;
  unreadForSupport: boolean;
  assignedTo: string | null;
  lastMessagePreview: string;
  updated: string;
}

export async function listTickets(options: { status?: string; limit?: number } = {}): Promise<AdminTicketRow[]> {
  const { supabaseListTickets } = await import('./data-supabase');
  const rows = await supabaseListTickets(options.status ?? 'all', options.limit ?? 50);
  return rows.map((t) => ({
    id: String(t.id ?? ''),
    uid: String(t.user_id ?? ''),
    username: String(t.username ?? 'member'),
    subject: String(t.subject ?? ''),
    category: String(t.category ?? 'Other'),
    status: String(t.status ?? 'Open'),
    unreadForSupport: t.unread_for_support === true,
    assignedTo: t.assigned_to ? String(t.assigned_to) : null,
    lastMessagePreview: String(t.last_message_preview ?? ''),
    updated: t.last_message_at ? new Date(t.last_message_at as string).toISOString() : new Date().toISOString(),
  }));
}

/* ---- FINANCE ------------------------------------------------------------- */

export interface FinanceSummary {
  usdPerToken: number;
  liabilityUsd: number;
  liabilityTokens: number;
  paidOutUsd: number;
  pending: { count: number; usd: number; tokens: number };
  byRail: Array<{ rail: string; count: number; usd: number }>;
  byCoin: Array<{ coin: string; count: number; usd: number }>;
}

export async function getFinanceSummary(): Promise<FinanceSummary> {
  const [rates, liability, pending] = await Promise.all([
    getRates(),
    getLiabilityUsd(),
    pendingPayoutTotal(),
  ]);

  const byRail = new Map<string, { count: number; usd: number }>();
  const byCoin = new Map<string, { count: number; usd: number }>();

  const { supabaseGetCompletedWithdrawals } = await import('./data-supabase');
  const rows = await supabaseGetCompletedWithdrawals(500);

  for (const r of rows) {
    const perUnit = Number(r.quoted_usd_per_unit ?? 0) || 0;
    const usd = perUnit * (Number(r.amount ?? 0) || 0);
    const rail = str(r.rail, 'FaucetPay');
    const coin = str(r.coin, 'USDT');

    const railEntry = byRail.get(rail) ?? { count: 0, usd: 0 };
    byRail.set(rail, { count: railEntry.count + 1, usd: railEntry.usd + usd });

    const coinEntry = byCoin.get(coin) ?? { count: 0, usd: 0 };
    byCoin.set(coin, { count: coinEntry.count + 1, usd: coinEntry.usd + usd });
  }

  const stats = await getPlatformStats();

  return {
    usdPerToken: rates.usdPerToken,
    liabilityUsd: liability.usd,
    liabilityTokens: liability.tokens,
    paidOutUsd: stats.paidOutUsd,
    pending,
    byRail: [...byRail.entries()].map(([rail, v]) => ({ rail, ...v })),
    byCoin: [...byCoin.entries()].map(([coin, v]) => ({ coin, ...v })),
  };
}
