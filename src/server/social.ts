import 'server-only';

import { referralUrl } from '@/lib/brand';
import { tierForCount } from '@/lib/config/economy';
import type {
  LeaderboardBoard,
  LeaderboardKey,
  LeaderboardRow,
  ReferralGeoPoint,
  ReferralRow,
  ReferralSummary,
  ReferralTier,
} from '@/lib/models';

import { getEconomy } from './config';
import { db, int, iso, isoOr, isServerFirebaseReady, num, str, weekKey } from './db';
import { countryName } from './users';

/* ============================================================================
   LEADERBOARDS AND REFERRALS
   ----------------------------------------------------------------------------
   LEADERBOARD SHAPE
   Entries live at `/leaderboard/{period}/entries/{uid}_{board}`, written by the
   ledger on every scoring credit. The composite document id is deliberate: it
   makes one user's five board positions five independent documents, so a
   `where board == x order by value desc limit 100` is a single indexed query
   per board instead of a scan plus client-side grouping.

   `period` is the ISO week, and `current` is an alias the ledger writes to so a
   score never has to compute the period. `resetLeaderboards` renames it.

   REFERRAL TREE
   `/referrals/{referrerUid}/list/{referredUid}` — one document per edge, id is
   the referred uid, so an edge is unique by construction and "am I already
   referred" is a document read rather than a query.
   ========================================================================== */

const BOARD_META: Record<LeaderboardKey, { metric: string; unit: string }> = {
  offerwall: { metric: 'Offers completed', unit: 'offers' },
  referral: { metric: 'Referral commission', unit: 'tokens' },
  shortlink: { metric: 'Shortlinks completed', unit: 'links' },
  faucet: { metric: 'Faucet claims', unit: 'claims' },
  ptc: { metric: 'PTC views', unit: 'views' },
};

export const LEADERBOARD_KEYS: LeaderboardKey[] = ['offerwall', 'referral', 'shortlink', 'faucet', 'ptc'];

export async function getLeaderboard(
  board: LeaderboardKey,
  viewerUid: string | null,
  size = 100,
): Promise<LeaderboardBoard> {
  const economy = await getEconomy();
  const meta = BOARD_META[board];
  const empty: LeaderboardBoard = {
    key: board,
    metric: meta.metric,
    unit: meta.unit,
    you: { rank: null, value: 0 },
    rows: [],
  };
  if (!isServerFirebaseReady()) return empty;

  try {
    const snap = await db()
      .collection('leaderboard/current/entries')
      .where('board', '==', board)
      .orderBy('value', 'desc')
      .limit(Math.min(size, economy.leaderboard.size))
      .get();

    const curve = economy.leaderboard.payoutCurveBps;
    const pool = economy.leaderboard.prizePoolPerBoard;

    const rows: LeaderboardRow[] = snap.docs.map((doc, index) => {
      const data = doc.data();
      const bps = curve[index] ?? 0;
      return {
        uid: str(data.uid),
        username: str(data.username, 'member'),
        countryCode: str(data.countryCode, 'XX'),
        value: int(data.value),
        prize: Math.floor((pool * bps) / 10_000),
        rank: index + 1,
      };
    });

    const mine = viewerUid ? rows.find((r) => r.uid === viewerUid) : undefined;
    let you = mine ? { rank: mine.rank, value: mine.value } : { rank: null as number | null, value: 0 };

    /* Outside the top N: read the viewer's own entry so the "you" strip still
       shows a real number rather than a zero. */
    if (viewerUid && !mine) {
      const own = await db().doc(`leaderboard/current/entries/${viewerUid}_${board}`).get();
      if (own.exists) you = { rank: null, value: int(own.get('value')) };
    }

    return { key: board, metric: meta.metric, unit: meta.unit, you, rows };
  } catch (error) {
    console.error(`[leaderboard] ${board} read failed`, error);
    return empty;
  }
}

export async function getAllLeaderboards(viewerUid: string | null): Promise<Record<LeaderboardKey, LeaderboardBoard>> {
  const boards = await Promise.all(LEADERBOARD_KEYS.map((key) => getLeaderboard(key, viewerUid, 100)));
  return LEADERBOARD_KEYS.reduce(
    (acc, key, index) => {
      acc[key] = boards[index]!;
      return acc;
    },
    {} as Record<LeaderboardKey, LeaderboardBoard>,
  );
}

/** When the current period closes — Sunday 00:00 UTC. */
export function leaderboardResetsAt(): string {
  const next = new Date();
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCDate(next.getUTCDate() + ((7 - next.getUTCDay()) % 7 || 7));
  return next.toISOString();
}

export const currentPeriod = (): string => weekKey();

/* ---- REFERRALS ----------------------------------------------------------- */

/** Approximate map position per country, for the referral geo bubbles. */
const GEO: Record<string, { x: number; y: number }> = {
  IN: { x: 70, y: 55 }, US: { x: 20, y: 40 }, BR: { x: 33, y: 70 }, ID: { x: 79, y: 66 },
  NG: { x: 49, y: 57 }, PH: { x: 83, y: 55 }, VN: { x: 78, y: 54 }, EG: { x: 55, y: 45 },
  UA: { x: 56, y: 33 }, TH: { x: 76, y: 55 }, KE: { x: 57, y: 62 }, PK: { x: 67, y: 47 },
  BD: { x: 73, y: 51 }, RU: { x: 65, y: 26 }, TR: { x: 55, y: 40 }, MX: { x: 16, y: 50 },
  AR: { x: 30, y: 82 }, CO: { x: 25, y: 62 }, PE: { x: 25, y: 70 }, GB: { x: 45, y: 30 },
  DE: { x: 49, y: 32 }, FR: { x: 46, y: 35 }, ES: { x: 43, y: 40 }, IT: { x: 50, y: 39 },
  PL: { x: 52, y: 31 }, NL: { x: 47, y: 30 }, CA: { x: 19, y: 26 }, AU: { x: 86, y: 79 },
  ZA: { x: 54, y: 78 }, MA: { x: 43, y: 45 }, DZ: { x: 47, y: 45 }, GH: { x: 46, y: 58 },
  MY: { x: 77, y: 61 }, SG: { x: 78, y: 62 }, JP: { x: 87, y: 40 }, KR: { x: 85, y: 39 },
  NP: { x: 71, y: 48 }, LK: { x: 71, y: 61 }, IQ: { x: 59, y: 43 }, SA: { x: 59, y: 49 },
  XX: { x: 50, y: 50 },
};

function statusFor(lastActiveIso: string | null): ReferralRow['status'] {
  if (!lastActiveIso) return 'dormant';
  const days = (Date.now() - Date.parse(lastActiveIso)) / 86_400_000;
  if (days <= 3) return 'active';
  if (days <= 14) return 'idle';
  return 'dormant';
}

export async function getReferralSummary(uid: string): Promise<ReferralSummary> {
  const economy = await getEconomy();
  const tiers: ReferralTier[] = economy.referrals.tiers.map((t) => ({
    name: t.name,
    at: t.at,
    rate: t.rate,
    perk: t.perk,
  }));

  const userSnap = await db().doc(`users/${uid}`).get();
  const user = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
  const code = str(user.referralCode);

  const listSnap = isServerFirebaseReady()
    ? await db().collection(`referrals/${uid}/list`).orderBy('joinedAt', 'desc').limit(200).get()
    : null;

  const rows: ReferralRow[] = (listSnap?.docs ?? []).map((doc) => {
    const data = doc.data();
    const lastActive = iso(data.lastActiveAt);
    return {
      uid: doc.id,
      username: str(data.username, 'member'),
      countryCode: str(data.countryCode, 'XX'),
      earned: int(data.commissionPaid),
      level: int(data.level, 1),
      joined: isoOr(data.joinedAt),
      lastActive: lastActive ?? isoOr(data.joinedAt),
      status: statusFor(lastActive),
      qualified: data.qualified === true,
    };
  });

  const qualified = rows.filter((r) => r.qualified).length;
  const { tier, rate, next } = tierForCount(qualified, economy.referrals);
  const commissionEarned = rows.reduce((sum, r) => sum + r.earned, 0);

  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.countryCode, (counts.get(row.countryCode) ?? 0) + 1);

  const byCountry: ReferralGeoPoint[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([codeKey, count]) => ({
      country: countryName(codeKey),
      code: codeKey,
      count,
      x: GEO[codeKey]?.x ?? 50,
      y: GEO[codeKey]?.y ?? 50,
    }));

  /* Click and signup attribution, written by the `?r=` handler in middleware. */
  const funnel = await db().doc(`referralStats/${uid}`).get();

  return {
    code,
    link: referralUrl(code),
    total: rows.length,
    qualified,
    activeThisWeek: rows.filter((r) => r.status === 'active').length,
    commissionEarned,
    tier,
    rate,
    nextTier: next ? (tiers.find((t) => t.name === next.name) ?? null) : null,
    toNextTier: next ? Math.max(0, next.at - qualified) : 0,
    rows,
    byCountry,
    clicks: funnel.exists ? int(funnel.get('clicks')) : 0,
    signups: funnel.exists ? int(funnel.get('signups')) : rows.length,
  };
}

export async function getReferralTiers(): Promise<ReferralTier[]> {
  const economy = await getEconomy();
  return economy.referrals.tiers.map((t) => ({ name: t.name, at: t.at, rate: t.rate, perk: t.perk }));
}

/**
 * Mark a referral as qualified once it reaches the configured level, and pay the
 * referrer the one-off bonus. Called after any credit that raises a level.
 */
export async function qualifyReferral(referredUid: string, level: number): Promise<void> {
  const economy = await getEconomy();
  if (level < economy.referrals.qualifyingLevel) return;

  const userSnap = await db().doc(`users/${referredUid}`).get();
  const referrer = str(userSnap.get('referredBy'));
  if (!referrer) return;

  const edgeRef = db().doc(`referrals/${referrer}/list/${referredUid}`);
  const edge = await edgeRef.get();
  if (!edge.exists || edge.get('qualified') === true) return;

  await edgeRef.update({ qualified: true, level, qualifiedAt: new Date(), updatedAt: new Date() });

  const { FieldValue } = await import('firebase-admin/firestore');
  await db().doc(`users/${referrer}`).update({
    referralQualified: FieldValue.increment(1),
    updatedAt: new Date(),
  });

  if (economy.referrals.qualifyBonusTokens > 0) {
    const { credit } = await import('./ledger');
    await credit({
      uid: referrer,
      source: 'referral',
      amount: economy.referrals.qualifyBonusTokens,
      label: 'Referral reached level 1',
      refId: referredUid,
      idempotencyKey: `refqual_${referredUid}`,
      applyBonus: false,
    });
  }

  /* Tier promotion follows the new qualified count. */
  const fresh = await db().doc(`users/${referrer}`).get();
  const { tier, rate } = tierForCount(int(fresh.get('referralQualified')), economy.referrals);
  await db().doc(`users/${referrer}`).update({
    referralTier: tier,
    commissionBps: rate * 100,
    updatedAt: new Date(),
  });
}

/** Count a referral link click, for the funnel numbers on the referrals page. */
export async function noteReferralClick(code: string): Promise<void> {
  if (!code || !isServerFirebaseReady()) return;
  try {
    const match = await db().collection('users').where('referralCode', '==', code).limit(1).get();
    const doc = match.docs[0];
    if (!doc) return;
    const { FieldValue } = await import('firebase-admin/firestore');
    await db()
      .doc(`referralStats/${doc.id}`)
      .set({ clicks: FieldValue.increment(1), updatedAt: new Date() }, { merge: true });
  } catch {
    // Attribution is best-effort; a failed click count is not worth an error.
  }
}

export { num };
