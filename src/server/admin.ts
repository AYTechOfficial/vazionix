import 'server-only';

import type {
  CoinTicker,
  PayoutRailName,
  WithdrawalRecord,
  WithdrawalStatus,
} from '@/lib/models';

import { getRates } from './config';
import { isSupabaseBackend } from '@/lib/backend';
import {
  FieldValue,
  bool,
  db,
  int,
  iso,
  isoOr,
  isServerFirebaseReady,
  now,
  num,
  str,
} from './db';
import { getDailySeries, getLiabilityUsd, getPlatformStats, type DailyStatRow } from './stats';
import { pendingPayoutTotal, railStatus } from './payouts';

/* ============================================================================
   ADMIN DATA
   ----------------------------------------------------------------------------
   Every read the staff console makes, against real Firestore. The previous
   revision of this project served the admin screens from 27 hand-written
   fixture modules; those are gone, and each function here answers with what is
   actually in the database — including "nothing yet", which is the correct
   answer for a fresh install and the one a fixture can never give.

   PAGINATION IS CURSOR-BASED
   `startAfter` on a document snapshot, not `offset`. Firestore bills `offset` as
   reads of every skipped document, so page 40 of the user table would cost 40
   pages of reads. Cursors cost the page you asked for.

   AGGREGATES USE count()
   Row counts come from `count()` aggregate queries, billed at one read per 1000
   documents matched. A `.get()` to measure `.size` bills every document.
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

/** Firestore collection name -> Supabase table name, where they differ. */
const SUPABASE_TABLE: Record<string, string> = {
  ptcAds: 'ptc_ads',
  offerwallProviders: 'offerwall_providers',
  offerwallConversions: 'offerwall_conversions',
  lotteryTickets: 'lottery_tickets',
  adUnits: 'ad_units',
  auditLog: 'audit_log',
};

/** Firestore field name -> Supabase column name, where they differ. */
const SUPABASE_COLUMN: Record<string, string> = {
  uid: 'user_id',
  lastMessageAt: 'last_message_at',
  createdAt: 'created_at',
  processedAt: 'processed_at',
  tokenCost: 'token_cost',
  countryCode: 'country_code',
};

export async function countWhere(collection: string, filters: Filter[] = []): Promise<number> {
  if (isSupabaseBackend) {
    /* The console's counts use equality and IN only, which map cleanly onto a
       Postgres count. An unsupported operator returns 0 and LOGS, rather than
       quietly producing a wrong number on a screen used to make decisions. */
    try {
      const { supabaseCountWhere } = await import('./data-supabase');
      const mapped: Array<[string, '==' | 'in', unknown]> = [];
      for (const [field, op, value] of filters) {
        if (op !== '==' && op !== 'in') {
          console.error(`[admin] countWhere: unsupported operator ${op} on ${collection}.${field}`);
          return 0;
        }
        mapped.push([SUPABASE_COLUMN[field] ?? field, op, value]);
      }
      return await supabaseCountWhere(SUPABASE_TABLE[collection] ?? collection, mapped);
    } catch (error) {
      console.error(`[admin] supabase count on ${collection} failed`, error);
      return 0;
    }
  }

  if (!isServerFirebaseReady()) return 0;
  try {
    let query = db().collection(collection) as unknown as import('firebase-admin/firestore').Query;
    for (const [field, op, value] of filters) {
      query = query.where(field, op as FirebaseFirestore.WhereFilterOp, value);
    }
    const snap = await query.count().get();
    return int(snap.data().count);
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

  if (isSupabaseBackend) {
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
      q = q.or(`username_lower.ilike.%${search}%,email.ilike.%${search}%`);
    }
    if (options.suspended !== undefined) q = q.eq('suspended', options.suspended);

    const { data, count, error } = await q.order(sortColumn, { ascending: false }).limit(limit);
    if (error) {
      console.error('[admin] supabase user list failed', error);
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
        emailVerified: r.email_verified,
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at,
      } as Record<string, unknown>),
    );
    return { rows, cursor: null, total: count ?? rows.length };
  }

  if (!isServerFirebaseReady()) return { rows: [], cursor: null, total: 0 };

  /* A search is a prefix range on `usernameLower`, or an exact email match.
     Firestore has no substring search; anything more than this needs an external
     index, and pretending otherwise would produce a search box that silently
     misses results. */
  if (search) {
    const [byName, byEmail] = await Promise.all([
      db()
        .collection('users')
        .orderBy('usernameLower')
        .startAt(search)
        .endAt(`${search}\uf8ff`)
        .limit(limit)
        .get(),
      search.includes('@')
        ? db().collection('users').where('email', '==', search).limit(5).get()
        : Promise.resolve(null),
    ]);

    const seen = new Set<string>();
    const rows: AdminUserRow[] = [];
    for (const doc of [...byName.docs, ...(byEmail?.docs ?? [])]) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      rows.push(userRow(doc.id, doc.data() as Record<string, unknown>));
    }
    return { rows, cursor: null, total: rows.length };
  }

  let query = db()
    .collection('users')
    .orderBy(options.sort ?? 'createdAt', 'desc')
    .limit(limit + 1);

  if (options.suspended !== undefined) {
    query = db()
      .collection('users')
      .where('suspended', '==', options.suspended)
      .orderBy('createdAt', 'desc')
      .limit(limit + 1);
  }

  if (options.cursor) {
    const anchor = await db().doc(`users/${options.cursor}`).get();
    if (anchor.exists) query = query.startAfter(anchor);
  }

  const [snap, total] = await Promise.all([
    query.get(),
    countWhere('users', options.suspended !== undefined ? [['suspended', '==', options.suspended]] : []),
  ]);

  const docs = snap.docs.slice(0, limit);
  const last = docs[docs.length - 1];

  return {
    rows: docs.map((doc) => userRow(doc.id, doc.data() as Record<string, unknown>)),
    cursor: snap.docs.length > limit && last ? last.id : null,
    total,
  };
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
  if (!isServerFirebaseReady()) return null;

  const snap = await db().doc(`users/${uid}`).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;

  const [claims, withdrawals, referrals, tickets] = await Promise.all([
    db().collection(`users/${uid}/claims`).orderBy('createdAt', 'desc').limit(50).get(),
    db().collection('withdrawals').where('uid', '==', uid).orderBy('createdAt', 'desc').limit(25).get(),
    db().collection(`referrals/${uid}/list`).orderBy('joinedAt', 'desc').limit(50).get(),
    db().collection('tickets').where('uid', '==', uid).orderBy('lastMessageAt', 'desc').limit(20).get(),
  ]);

  return {
    ...userRow(uid, data),
    referralCode: str(data.referralCode),
    referredBy: data.referredBy ? str(data.referredBy) : null,
    referralTier: str(data.referralTier, 'Bronze'),
    commissionBps: int(data.commissionBps),
    earningBonusBps: int(data.earningBonusBps),
    streakDays: int(data.streakDays),
    claimCounts: (data.claimCounts ?? {}) as Record<string, number>,
    suspendedReason: data.suspendedReason ? str(data.suspendedReason) : null,
    signupIp: data.signupIp ? str(data.signupIp) : null,
    recentClaims: claims.docs.map((doc) => ({
      id: doc.id,
      source: str(doc.get('source')),
      amount: int(doc.get('amount')),
      label: str(doc.get('label')),
      at: isoOr(doc.get('createdAt')),
    })),
    withdrawals: withdrawals.docs.map((doc) => adminWithdrawalRow(doc.id, doc.data() as Record<string, unknown>)),
    referrals: referrals.docs.map((doc) => ({
      uid: doc.id,
      username: str(doc.get('username'), 'member'),
      level: int(doc.get('level'), 1),
      qualified: doc.get('qualified') === true,
      joined: isoOr(doc.get('joinedAt')),
    })),
    tickets: tickets.docs.map((doc) => ({
      id: doc.id,
      subject: str(doc.get('subject')),
      status: str(doc.get('status'), 'Open'),
      updated: isoOr(doc.get('lastMessageAt')),
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

  if (isSupabaseBackend) {
    const { supabaseWithdrawalsByStatus, supabaseCountWhere } = await import('./data-supabase');
    const statuses =
      status === 'queue' ? ['Pending', 'HeldForReview', 'Processing']
      : status === 'all' ? []
      : [status];

    try {
      const rows = statuses.length
        ? await supabaseWithdrawalsByStatus(statuses, limit)
        : await supabaseWithdrawalsByStatus(
            ['Pending', 'HeldForReview', 'Processing', 'Completed', 'Rejected', 'Failed', 'Reversed'],
            limit,
          );

      const total = statuses.length
        ? await supabaseCountWhere('withdrawals', [['status', 'in', statuses]])
        : await supabaseCountWhere('withdrawals');

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
      console.error('[admin] supabase withdrawal queue failed', error);
      return { rows: [], cursor: null, total: 0 };
    }
  }

  if (!isServerFirebaseReady()) return { rows: [], cursor: null, total: 0 };

  let query = db().collection('withdrawals').orderBy('createdAt', 'desc').limit(limit + 1);

  if (status === 'queue') {
    query = db()
      .collection('withdrawals')
      .where('status', 'in', ['Pending', 'HeldForReview', 'Processing'])
      .orderBy('createdAt', 'desc')
      .limit(limit + 1);
  } else if (status !== 'all') {
    query = db()
      .collection('withdrawals')
      .where('status', '==', status)
      .orderBy('createdAt', 'desc')
      .limit(limit + 1);
  }

  if (options.cursor) {
    const anchor = await db().doc(`withdrawals/${options.cursor}`).get();
    if (anchor.exists) query = query.startAfter(anchor);
  }

  const snap = await query.get();
  const docs = snap.docs.slice(0, limit);
  const last = docs[docs.length - 1];

  const total =
    status === 'queue'
      ? await countWhere('withdrawals', [['status', 'in', ['Pending', 'HeldForReview', 'Processing']]])
      : status === 'all'
        ? await countWhere('withdrawals')
        : await countWhere('withdrawals', [['status', '==', status]]);

  return {
    rows: docs.map((doc) => adminWithdrawalRow(doc.id, doc.data() as Record<string, unknown>)),
    cursor: snap.docs.length > limit && last ? last.id : null,
    total,
  };
}

/* ---- MODERATION ---------------------------------------------------------- */

export async function suspendUser(
  uid: string,
  reason: string,
  actorUid: string,
  untilIso?: string | null,
): Promise<void> {
  await db().doc(`users/${uid}`).update({
    suspended: true,
    suspendedReason: reason,
    suspendedUntil: untilIso ? new Date(untilIso) : null,
    suspendedBy: actorUid,
    suspendedAt: now(),
    updatedAt: now(),
  });
  await writeAudit({ actorUid, action: 'user.suspend', target: uid, detail: reason });
}

export async function unsuspendUser(uid: string, actorUid: string): Promise<void> {
  await db().doc(`users/${uid}`).update({
    suspended: false,
    suspendedReason: null,
    suspendedUntil: null,
    updatedAt: now(),
  });
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
    await db().collection('auditLog').add({
      actorUid: entry.actorUid,
      actorName: entry.actorName ?? entry.actorUid,
      action: entry.action,
      target: entry.target,
      detail: entry.detail,
      createdAt: now(),
    });
  } catch (error) {
    console.error('[admin] audit write failed', error);
  }
}

export async function listAudit(limit = 50, cursor?: string | null): Promise<{ rows: AuditRow[]; cursor: string | null }> {
  if (!isServerFirebaseReady()) return { rows: [], cursor: null };

  let query = db().collection('auditLog').orderBy('createdAt', 'desc').limit(limit + 1);
  if (cursor) {
    const at = new Date(cursor);
    if (!Number.isNaN(at.getTime())) query = query.startAfter(at);
  }

  const snap = await query.get();
  const docs = snap.docs.slice(0, limit);
  const rows: AuditRow[] = docs.map((doc) => ({
    id: doc.id,
    actorUid: str(doc.get('actorUid')),
    actorName: str(doc.get('actorName'), str(doc.get('actorUid'))),
    action: str(doc.get('action')),
    target: str(doc.get('target')),
    detail: str(doc.get('detail')),
    at: isoOr(doc.get('createdAt')),
  }));

  const last = rows[rows.length - 1];
  return { rows, cursor: snap.docs.length > limit && last ? last.at : null };
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
  if (!isServerFirebaseReady()) return [];
  const snap = await db().collection('adUnits').get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      placement: doc.id,
      kind: str(data.kind, 'html'),
      network: str(data.network, '—'),
      enabled: bool(data.enabled, true),
      hasPayload: Boolean(data.html || data.src || data.url),
      capPerSession: int(data.capPerSession),
      updatedAt: iso(data.updatedAt),
    };
  });
}

export async function saveAdUnit(
  placement: string,
  patch: Record<string, unknown>,
  actorUid: string,
): Promise<void> {
  await db()
    .doc(`adUnits/${placement}`)
    .set({ ...patch, updatedAt: now(), updatedBy: actorUid }, { merge: true });
  await writeAudit({
    actorUid,
    action: 'ads.unit.save',
    target: placement,
    detail: `kind=${str(patch.kind, 'html')} enabled=${patch.enabled !== false}`,
  });
}

export async function deleteAdUnit(placement: string, actorUid: string): Promise<void> {
  await db().doc(`adUnits/${placement}`).delete();
  await writeAudit({ actorUid, action: 'ads.unit.delete', target: placement, detail: '' });
}

/* ---- MODULE CATALOGUES (PTC, shortlinks, challenges, offerwall) ---------- */

export interface CatalogueRow {
  id: string;
  enabled: boolean;
  fields: Record<string, unknown>;
  updatedAt: string | null;
}

export async function listCatalogue(collection: string, limit = 200): Promise<CatalogueRow[]> {
  if (!isServerFirebaseReady()) return [];
  const snap = await db().collection(collection).limit(limit).get();
  return snap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    /* `createdAt` is destructured out and discarded on purpose: the editor round-
       trips `fields` straight back into a write, and echoing a server timestamp
       would overwrite the real creation time with a stale copy of itself. */
    const { createdAt: _createdAt, updatedAt, ...fields } = data;
    return {
      id: doc.id,
      enabled: bool(data.enabled, true),
      fields,
      updatedAt: iso(updatedAt),
    };
  });
}

export async function upsertCatalogueItem(
  collection: string,
  id: string | null,
  fields: Record<string, unknown>,
  actorUid: string,
): Promise<string> {
  const ref = id ? db().doc(`${collection}/${id}`) : db().collection(collection).doc();
  await ref.set(
    { ...fields, updatedAt: now(), updatedBy: actorUid, ...(id ? {} : { createdAt: now() }) },
    { merge: true },
  );
  await writeAudit({
    actorUid,
    action: `${collection}.upsert`,
    target: ref.id,
    detail: str(fields.title ?? fields.name, ref.id),
  });
  return ref.id;
}

export async function deleteCatalogueItem(
  collection: string,
  id: string,
  actorUid: string,
): Promise<void> {
  await db().doc(`${collection}/${id}`).delete();
  await writeAudit({ actorUid, action: `${collection}.delete`, target: id, detail: '' });
}

/* ---- CONFIG WRITES ------------------------------------------------------- */

export async function saveConfig(
  section: 'economy' | 'rates' | 'ads' | 'site',
  patch: Record<string, unknown>,
  actorUid: string,
): Promise<void> {
  await db().doc(`config/${section}`).set({ ...patch, updatedAt: now(), updatedBy: actorUid }, { merge: true });
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
  if (!isServerFirebaseReady()) return [];

  let query = db().collection('tickets').orderBy('lastMessageAt', 'desc').limit(options.limit ?? 50);
  if (options.status && options.status !== 'all') {
    query = db()
      .collection('tickets')
      .where('status', '==', options.status)
      .orderBy('lastMessageAt', 'desc')
      .limit(options.limit ?? 50);
  }

  const snap = await query.get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      uid: str(data.uid),
      username: str(data.username, 'member'),
      subject: str(data.subject),
      category: str(data.category, 'Other'),
      status: str(data.status, 'Open'),
      unreadForSupport: bool(data.unreadForSupport),
      assignedTo: data.assignedTo ? str(data.assignedTo) : null,
      lastMessagePreview: str(data.lastMessagePreview),
      updated: isoOr(data.lastMessageAt),
    };
  });
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
  const [rates, liability, pending, stats] = await Promise.all([
    getRates(),
    getLiabilityUsd(),
    pendingPayoutTotal(),
    getPlatformStats(),
  ]);

  const byRail = new Map<string, { count: number; usd: number }>();
  const byCoin = new Map<string, { count: number; usd: number }>();

  if (isServerFirebaseReady()) {
    const snap = await db()
      .collection('withdrawals')
      .where('status', '==', 'Completed')
      .orderBy('processedAt', 'desc')
      .limit(500)
      .get();

    for (const doc of snap.docs) {
      const usd = Number(str(doc.get('usdValue'), '0')) || 0;
      const rail = str(doc.get('rail'), 'FaucetPay');
      const coin = str(doc.get('coin'), 'USDT');

      const railEntry = byRail.get(rail) ?? { count: 0, usd: 0 };
      byRail.set(rail, { count: railEntry.count + 1, usd: railEntry.usd + usd });

      const coinEntry = byCoin.get(coin) ?? { count: 0, usd: 0 };
      byCoin.set(coin, { count: coinEntry.count + 1, usd: coinEntry.usd + usd });
    }
  }

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

export { FieldValue, num };
