import 'server-only';

import type { ChallengeItem, DailyState, DailyStep } from '@/lib/models';

import { getEconomy, getSiteConfig } from '../config';
import { AppError, bool, int, iso, str, tooMany, weekKey } from '../db';
import {
  supabaseGetChallenge,
  supabaseGetUser,
  supabaseListChallenges,
  supabaseListClaims,
  supabaseUpdateUserStreak,
} from '../data-supabase';
import { credit, type CreditResult } from '../ledger';

/* ============================================================================
   DAILY BONUS AND CHALLENGES
   ----------------------------------------------------------------------------
   DAILY BONUS is a streak ladder. The step a user is on is derived from
   `streak_days` on their profile row, not stored separately, so the streak
   that drives the earning bonus and the step that decides the payout can
   never disagree.

   Two windows, and the gap between them is the point:
     • cooldownHours (20)   — earliest the next claim is allowed
     • breakAfterHours (48) — latest before the ladder resets to step one
   A 20/48 pair means a user who claims once a day keeps their streak even if
   they are twelve hours late, but cannot claim twice in one day. A single
   24-hour window would punish anyone whose routine drifts by an hour.

   CHALLENGES are progress mirrors, not counters of their own. Progress reads
   the same `claim_counts` the ledger maintains, so a challenge can never claim
   a user completed 50 faucet claims that the ledger does not show.
   ========================================================================== */

/* ---- DAILY BONUS --------------------------------------------------------- */

export async function getDailyState(uid: string): Promise<DailyState> {
  const economy = await getEconomy();
  const cfg = economy.daily;
  const steps: DailyStep[] = cfg.steps.map((s, i) => ({ day: i, ...s }));

  const row = await supabaseGetUser(uid);
  const data = (row ?? {}) as Record<string, unknown>;

  const lastIso = iso(data.last_streak_claim_at);
  const lastMs = lastIso ? Date.parse(lastIso) : 0;
  const hoursSince = lastMs ? (Date.now() - lastMs) / 3_600_000 : Infinity;

  const brokenStreak = hoursSince > cfg.breakAfterHours;
  const streakDays = brokenStreak ? 0 : int(data.streak_days);
  const current = Math.min(streakDays, steps.length - 1);

  const nextMs = lastMs ? lastMs + cfg.cooldownHours * 3_600_000 : 0;
  const remaining = Math.max(0, Math.ceil((nextMs - Date.now()) / 1000));

  return {
    steps,
    current,
    claimable: remaining === 0,
    nextClaimAt: remaining > 0 ? new Date(nextMs).toISOString() : null,
    secondsRemaining: remaining,
    streakDays,
  };
}

export async function claimDailyBonus(args: { uid: string; ip: string | null }): Promise<
  CreditResult & { step: number; streakDays: number; nextClaimAt: string }
> {
  const [economy, site] = await Promise.all([getEconomy(), getSiteConfig()]);
  if (!site.earningOpen) throw new AppError('Earning is paused right now.', 503, 'earning_paused');

  const cfg = economy.daily;
  const row = await supabaseGetUser(args.uid);
  if (!row) throw new AppError('Account not found.', 404, 'not_found');
  const data = row as Record<string, unknown>;

  const lastIso = iso(data.last_streak_claim_at);
  const lastMs = lastIso ? Date.parse(lastIso) : 0;
  const hoursSince = lastMs ? (Date.now() - lastMs) / 3_600_000 : Infinity;

  if (hoursSince < cfg.cooldownHours) {
    const seconds = Math.ceil((cfg.cooldownHours - hoursSince) * 3600);
    const hours = Math.floor(seconds / 3600);
    throw tooMany(
      `Next daily bonus in ${hours ? `${hours}h ${Math.floor((seconds % 3600) / 60)}m` : `${Math.ceil(seconds / 60)}m`}.`,
      'cooldown',
    );
  }

  const brokenStreak = hoursSince > cfg.breakAfterHours;
  const priorStreak = brokenStreak ? 0 : int(data.streak_days);
  const stepIndex = Math.min(priorStreak, cfg.steps.length - 1);
  const step = cfg.steps[stepIndex]!;

  /* One claim per cooldown window, keyed on the window rather than the day, so a
     user whose routine drifts is not blocked by a calendar boundary. */
  const window = Math.floor(Date.now() / (cfg.cooldownHours * 3_600_000));

  const result = await credit({
    uid: args.uid,
    source: 'bonus',
    amount: step.tokens,
    exp: step.exp,
    label: `Daily bonus — day ${stepIndex + 1}`,
    refId: `day${stepIndex + 1}`,
    idempotencyKey: `daily_${window}`,
    ip: args.ip,
  });

  const nextStreak = priorStreak + 1;
  await supabaseUpdateUserStreak(args.uid, nextStreak, new Date().toISOString());

  const nextClaimAt = new Date(Date.now() + cfg.cooldownHours * 3_600_000).toISOString();
  return { ...result, step: stepIndex, streakDays: nextStreak, nextClaimAt };
}

/* ---- CHALLENGES ---------------------------------------------------------- */

const PROGRESS_FIELD: Record<ChallengeItem['kind'], (u: Record<string, unknown>) => number> = {
  faucet: (u) => int((u.claim_counts as Record<string, unknown>)?.faucet),
  ptc: (u) => int((u.claim_counts as Record<string, unknown>)?.ptc),
  shortlink: (u) => int((u.claim_counts as Record<string, unknown>)?.shortlink),
  offerwall: (u) => int((u.claim_counts as Record<string, unknown>)?.offerwall),
  referral: (u) => int(u.referral_qualified),
};

/** Deterministic claim id: `once` challenges pay forever, `weekly` reset. */
function challengeKey(id: string, repeat: string): string {
  return repeat === 'weekly' ? `challenge_${id}_${weekKey()}` : `challenge_${id}`;
}

export async function listChallenges(uid: string | null): Promise<ChallengeItem[]> {
  const list = await supabaseListChallenges();
  const rows = list.map((r) => ({ id: String(r.id), data: r as Record<string, unknown> }));
  if (!rows.length) return [];

  let user: Record<string, unknown> = {};
  let claimedIds = new Set<string>();

  if (uid) {
    const [row, claims] = await Promise.all([
      supabaseGetUser(uid),
      supabaseListClaims(uid, { limit: 300, source: 'challenge', cursorIso: null }),
    ]);
    user = (row ?? {}) as Record<string, unknown>;
    /* The idempotency key IS the challenge claim id, so a claimed challenge is
       one whose key appears in the ledger. */
    claimedIds = new Set(
      (claims ?? []).map((c) => String(c.client_request_id ?? '')).filter(Boolean),
    );
  }

  return rows.map(({ id, data }) => {
    const kind = (str(data.kind, 'faucet') as ChallengeItem['kind']);
    const of = int(data.target, 1);
    const at = uid ? Math.min(of, PROGRESS_FIELD[kind]?.(user) ?? 0) : 0;
    const claimed = claimedIds.has(challengeKey(id, str(data.repeat, 'once')));

    return {
      id,
      title: str(data.title, 'Challenge'),
      tokens: int(data.tokens),
      exp: int(data.exp),
      at,
      of,
      note: data.note ? str(data.note) : null,
      kind,
      claimed,
      claimable: !claimed && at >= of && of > 0,
    };
  });
}

export async function claimChallenge(args: {
  uid: string;
  challengeId: string;
  ip: string | null;
}): Promise<CreditResult & { challengeId: string }> {
  const site = await getSiteConfig();
  if (!site.earningOpen) throw new AppError('Earning is paused right now.', 503, 'earning_paused');

  const [row, userRow] = await Promise.all([
    supabaseGetChallenge(args.challengeId),
    supabaseGetUser(args.uid),
  ]);
  if (!row) throw new AppError('Challenge not found.', 404, 'not_found');
  const data = row as Record<string, unknown>;
  if (!bool(data.enabled, true)) throw new AppError('That challenge has ended.', 400, 'disabled');
  if (!userRow) throw new AppError('Account not found.', 404, 'not_found');
  const user = userRow as Record<string, unknown>;

  const kind = (str(data.kind, 'faucet') as ChallengeItem['kind']);
  const target = int(data.target, 1);
  const progress = PROGRESS_FIELD[kind]?.(user) ?? 0;

  if (progress < target) {
    throw new AppError(
      `Not finished yet — ${progress} of ${target}.`,
      400,
      'incomplete',
    );
  }

  const result = await credit({
    uid: args.uid,
    source: 'challenge',
    amount: int(data.tokens),
    exp: int(data.exp),
    label: `Challenge — ${str(data.title, 'completed')}`,
    refId: args.challengeId,
    idempotencyKey: challengeKey(args.challengeId, str(data.repeat, 'once')),
    applyBonus: false,
    ip: args.ip,
  });

  if (result.replayed) throw new AppError('You already claimed that challenge.', 409, 'already_claimed');
  return { ...result, challengeId: args.challengeId };
}
