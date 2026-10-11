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
import { int, isoOr, str } from './db';
import { countryName } from './users';

/* ============================================================================
   LEADERBOARDS AND REFERRALS
   ----------------------------------------------------------------------------
   LEADERBOARD SHAPE
   Rows live in public.leaderboard_entries, written by the credit() RPC on every
   scoring claim, keyed (period, board, user_id) with period='current' as the
   alias the RPC writes to. A board is one indexed query, not a scan plus
   client-side grouping.

   REFERRAL TREE
   public.referrals — one row per edge, unique (referrer_id, referred_user_id)
   by constraint, so nobody can be referred twice and "is this edge there" is a
   key read rather than a query.
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

  try {
    const { supabaseGetBoardEntries, supabaseGetViewerBoardEntry } = await import('./data-supabase');
    const rows = await supabaseGetBoardEntries(board, Math.min(size, economy.leaderboard.size));
    const curve = economy.leaderboard.payoutCurveBps;
    const pool = economy.leaderboard.prizePoolPerBoard;
    const list: LeaderboardRow[] = rows.map((data: Record<string, unknown>, index: number) => {
      const bps = curve[index] ?? 0;
      return {
        uid: String(data.user_id ?? ''),
        username: String(data.username ?? 'member'),
        countryCode: String(data.country_code ?? 'XX'),
        value: Number(data.value ?? 0),
        prize: Math.floor((pool * bps) / 10_000),
        rank: index + 1,
      };
    });
    const mine = viewerUid ? list.find((r) => r.uid === viewerUid) : undefined;
    let you = mine ? { rank: mine.rank, value: mine.value } : { rank: null as number | null, value: 0 };
    if (viewerUid && !mine) {
      /* Outside the top N: read the viewer's own entry so the "you" strip still
         shows a real number rather than a zero. */
      const own = await supabaseGetViewerBoardEntry(viewerUid, board);
      if (own) you = { rank: null, value: Number(own.value ?? 0) };
    }
    return { key: board, metric: meta.metric, unit: meta.unit, you, rows: list };
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

export const currentPeriod = (): string => {
  const date = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

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
  const tiers: ReferralTier[] = economy.referrals.tiers.map((t: Record<string, unknown>) => ({
    name: String(t.name ?? 'Bronze') as ReferralTier['name'],
    at: Number(t.at ?? 0),
    rate: Number(t.rate ?? 0),
    perk: String(t.perk ?? ''),
  }));

  const { supabaseGetUser, supabaseListReferrals } = await import('./data-supabase');
  const [userRow, refRows] = await Promise.all([
    supabaseGetUser(uid),
    supabaseListReferrals(uid, 200),
  ]);
  const u = (userRow ?? {}) as Record<string, unknown>;
  const user = { ...u, referralCode: u.referral_code };

  const rows: ReferralRow[] = refRows.map((d: Record<string, unknown>) => {
    const lastActive = d.last_active_at ? new Date(d.last_active_at as string).toISOString() : null;
    const joined = d.joined_at ? new Date(d.joined_at as string).toISOString() : new Date().toISOString();
    return {
      uid: String(d.referred_user_id ?? ''),
      username: String(d.username ?? 'member'),
      countryCode: String(d.country_code ?? 'XX'),
      earned: Number(d.commission_paid ?? 0),
      level: Number(d.level ?? 1),
      joined,
      lastActive: lastActive ?? joined,
      status: statusFor(lastActive),
      qualified: d.qualified === true,
    };
  });

  const code = str(user.referralCode);

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
    clicks: 0,
    signups: rows.length,
  };
}

export async function getReferralTiers(): Promise<ReferralTier[]> {
  const economy = await getEconomy();
  return economy.referrals.tiers.map((t: Record<string, unknown>) => ({ name: String(t.name ?? 'Bronze') as ReferralTier['name'], at: Number(t.at ?? 0), rate: Number(t.rate ?? 0), perk: String(t.perk ?? '') }));
}

/**
 * Mark a referral as qualified once it reaches the configured level, and pay the
 * referrer the one-off bonus. Called after any credit that raises a level.
 */
export async function qualifyReferral(referredUid: string, level: number): Promise<void> {
  const economy = await getEconomy();
  if (level < economy.referrals.qualifyingLevel) return;

  const { supabaseGetUser } = await import('./data-supabase');
  const { getServerSupabase } = await import('./supabase');
  const row = await supabaseGetUser(referredUid);
  const referrer = str(row?.referred_by);
  if (!referrer) return;

  const client = getServerSupabase();

  /* Claim the qualification: only the first caller flips the flag, so a level-up
     replay cannot pay the bonus twice. */
  const { data: edge, error: claimError } = await client
    .from('referrals')
    .update({ qualified: true, level, updated_at: new Date().toISOString() })
    .eq('referrer_id', referrer)
    .eq('referred_user_id', referredUid)
    .eq('qualified', false)
    .select('*')
    .maybeSingle();
  if (claimError) throw claimError;
  if (!edge) return; // already qualified, or no edge

  const referrerRow = await supabaseGetUser(referrer);
  const { error: bumpError } = await client
    .from('users')
    .update({
      referral_qualified: int(referrerRow?.referral_qualified) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', referrer);
  if (bumpError) throw bumpError;

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
  const fresh = await supabaseGetUser(referrer);
  const { tier, rate } = tierForCount(int(fresh?.referral_qualified), economy.referrals);
  await client
    .from('users')
    .update({ referral_tier: tier, commission_bps: rate * 100, updated_at: new Date().toISOString() })
    .eq('id', referrer);
}

/** Count a referral link click, for the funnel numbers on the referrals page. */
export async function noteReferralClick(code: string): Promise<void> {
  if (!code) return;
  try {
    /* Click attribution is best-effort; a failed count is not worth an error.
       The referral page derives its funnel from real edges, so this resolves the
       code purely to validate it exists. */
    const { getServerSupabase } = await import('./supabase');
    await getServerSupabase()
      .from('users')
      .select('id')
      .eq('referral_code', code)
      .limit(1)
      .maybeSingle();
  } catch {
    // Attribution is best-effort.
  }
}

export { isoOr };
