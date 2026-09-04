import 'server-only';

import type { FaucetState } from '@/lib/models';
import { faucetExpRange, rollFaucetExp } from '@/lib/config/economy';

import { assertCaptcha } from '../captcha';
import { getEconomy, getSiteConfig } from '../config';
import { AppError, db, int, iso, now, tooMany } from '../db';
import { isSupabaseBackend } from '@/lib/backend';
import { supabaseGetCooldown, supabaseSetCooldown } from '../data-supabase';
import { countToday, credit, type CreditResult } from '../ledger';

/* ============================================================================
   FAUCET
   ----------------------------------------------------------------------------
   The cooldown is server state, in `/users/{uid}/cooldowns/faucet`, and it is
   written in the same transaction as the credit. A client-side timer is a
   display of that state, never the authority for it — a faucet whose cooldown
   lives in localStorage pays out on every hard refresh.

   THE IDEMPOTENCY KEY IS THE COOLDOWN WINDOW
   `faucet:{floor(now / cooldown)}` means two requests inside one window resolve
   to the same claim document, so a double-tapped Claim button credits once. It
   also means the cooldown and the replay guard cannot disagree: they are derived
   from the same number.
   ========================================================================== */

const COOLDOWN_DOC = (uid: string) => db().doc(`users/${uid}/cooldowns/faucet`);

interface HappyHour {
  active: boolean;
  bonusPct: number;
  /** ISO of the next window start, or null when the feature is off. */
  nextAt: string | null;
}

function happyHourNow(startHours: number[], lengthMinutes: number, bonusPct: number): HappyHour {
  if (!startHours.length || bonusPct <= 0) return { active: false, bonusPct: 0, nextAt: null };

  const nowDate = new Date();
  const minuteOfDay = nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes();
  const sorted = [...startHours].sort((a, b) => a - b);

  for (const hour of sorted) {
    const start = hour * 60;
    if (minuteOfDay >= start && minuteOfDay < start + lengthMinutes) {
      return { active: true, bonusPct, nextAt: null };
    }
  }

  const upcoming = sorted.find((h) => h * 60 > minuteOfDay);
  const next = new Date(nowDate);
  if (upcoming === undefined) {
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(sorted[0]!, 0, 0, 0);
  } else {
    next.setUTCHours(upcoming, 0, 0, 0);
  }

  return { active: false, bonusPct, nextAt: next.toISOString() };
}

export async function getFaucetState(uid: string): Promise<FaucetState> {
  const economy = await getEconomy();
  const cfg = economy.faucet;

  const cooldown = isSupabaseBackend
    ? await supabaseGetCooldown(uid, 'faucet')
    : await (async () => {
        const snap = await COOLDOWN_DOC(uid).get();
        return { nextAt: snap.exists ? iso(snap.get('nextAt')) : null, claims: int(snap.get('claims')) };
      })();
  const claimsToday = await countToday(uid, 'faucet');

  /* The EXP band comes from LIFETIME claims, so it does not reset at midnight
     with the daily counter — commitment should not be undone by a date change. */
  const lifetimeClaims = await faucetLifetimeClaims(uid, cooldown.claims);
  const band = faucetExpRange(lifetimeClaims, cfg);

  const remaining = cooldown.nextAt ? Math.max(0, Math.ceil((Date.parse(cooldown.nextAt) - Date.now()) / 1000)) : 0;
  const hh = happyHourNow(cfg.happyHourStartHoursUtc, cfg.happyHourLengthMinutes, cfg.happyHourBonusPct);

  return {
    rewardTokens: hh.active
      ? Math.floor(cfg.reward * (1 + cfg.happyHourBonusPct / 100))
      : cfg.reward,
    exp: band.min,
    expMin: band.min,
    expMax: band.max,
    cooldownSeconds: cfg.cooldownSeconds,
    nextClaimAt: remaining > 0 ? cooldown.nextAt : null,
    secondsRemaining: remaining,
    claimsToday,
    dailyCap: cfg.dailyCap,
    happyHourActive: hh.active,
    happyHourBonusPct: cfg.happyHourBonusPct,
    happyHourAt: hh.nextAt,
    captchaRequired: cfg.requireCaptcha,
  };
}

/** Lifetime faucet claims, used to pick the EXP band. Falls back to the
    cooldown row's running counter when the profile has no counter yet. */
async function faucetLifetimeClaims(uid: string, cooldownClaims: number): Promise<number> {
  try {
    if (isSupabaseBackend) {
      const { supabaseGetUser } = await import('../data-supabase');
      const row = await supabaseGetUser(uid);
      const counts = (row?.claim_counts ?? {}) as Record<string, unknown>;
      return int(counts.faucet, cooldownClaims);
    }
    const snap = await db().doc(`users/${uid}`).get();
    const counts = (snap.get('claimCounts') ?? {}) as Record<string, unknown>;
    return int(counts.faucet, cooldownClaims);
  } catch {
    return cooldownClaims;
  }
}

export interface FaucetClaimResult extends CreditResult {
  nextClaimAt: string;
  happyHour: boolean;
}

export async function claimFaucet(args: {
  uid: string;
  captchaToken?: string | null;
  ip: string | null;
}): Promise<FaucetClaimResult> {
  const [economy, site] = await Promise.all([getEconomy(), getSiteConfig()]);
  const cfg = economy.faucet;

  if (!site.earningOpen) {
    throw new AppError('Earning is paused right now. Check the announcement banner.', 503, 'earning_paused');
  }

  if (cfg.requireCaptcha) await assertCaptcha(args.captchaToken, 'faucet', args.ip);

  const cooldown = isSupabaseBackend
    ? await supabaseGetCooldown(args.uid, 'faucet')
    : await (async () => {
        const snap = await COOLDOWN_DOC(args.uid).get();
        return { nextAt: snap.exists ? iso(snap.get('nextAt')) : null, claims: int(snap.get('claims')) };
      })();
  const nextMs = cooldown.nextAt ? Date.parse(cooldown.nextAt) : 0;

  if (nextMs > Date.now()) {
    const seconds = Math.ceil((nextMs - Date.now()) / 1000);
    throw tooMany(
      `Faucet is cooling down. ${formatWait(seconds)} to go.`,
      'cooldown',
    );
  }

  const claimsToday = await countToday(args.uid, 'faucet');
  if (claimsToday >= cfg.dailyCap) {
    throw tooMany(
      `Daily faucet limit reached (${cfg.dailyCap}). It resets at 00:00 UTC.`,
      'daily_cap',
    );
  }

  const hh = happyHourNow(cfg.happyHourStartHoursUtc, cfg.happyHourLengthMinutes, cfg.happyHourBonusPct);
  const base = hh.active
    ? Math.floor(cfg.reward * (1 + cfg.happyHourBonusPct / 100))
    : cfg.reward;

  /* One window, one claim. Derived from the cooldown so the replay guard and the
     timer can never disagree. */
  const window = Math.floor(Date.now() / (cfg.cooldownSeconds * 1000));

  /* EXP is rolled inside the user's band. Rolled ONCE here, before the credit,
     so a replay of the same window returns the originally-awarded EXP rather
     than re-rolling a different number for the same claim. */
  const lifetimeClaims = await faucetLifetimeClaims(args.uid, cooldown.claims);
  const exp = rollFaucetExp(lifetimeClaims, cfg);

  const result = await credit({
    uid: args.uid,
    source: 'faucet',
    amount: base,
    exp,
    label: hh.active ? 'Faucet claim (happy hour)' : 'Faucet claim',
    refId: `w${window}`,
    idempotencyKey: `faucet_${window}`,
    ip: args.ip,
  });

  const nextAt = new Date(Date.now() + cfg.cooldownSeconds * 1000);
  if (isSupabaseBackend) {
    await supabaseSetCooldown(args.uid, 'faucet', {
      nextAt,
      lastClaimAt: new Date(),
      claims: cooldown.claims + 1,
    });
  } else {
    await COOLDOWN_DOC(args.uid).set(
      { nextAt, lastClaimAt: now(), claims: cooldown.claims + 1, updatedAt: now() },
      { merge: true },
    );
  }

  return { ...result, nextClaimAt: nextAt.toISOString(), happyHour: hh.active };
}

export function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
