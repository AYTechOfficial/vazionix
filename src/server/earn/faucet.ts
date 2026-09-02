import 'server-only';

import type { FaucetState } from '@/lib/models';

import { assertCaptcha } from '../captcha';
import { getEconomy, getSiteConfig } from '../config';
import { AppError, db, int, iso, now, tooMany } from '../db';
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

  const [snap, claimsToday] = await Promise.all([
    COOLDOWN_DOC(uid).get(),
    countToday(uid, 'faucet'),
  ]);

  const nextAtIso = snap.exists ? iso(snap.get('nextAt')) : null;
  const nextMs = nextAtIso ? Date.parse(nextAtIso) : 0;
  const remaining = Math.max(0, Math.ceil((nextMs - Date.now()) / 1000));
  const hh = happyHourNow(cfg.happyHourStartHoursUtc, cfg.happyHourLengthMinutes, cfg.happyHourBonusPct);

  return {
    rewardTokens: hh.active
      ? Math.floor(cfg.reward * (1 + cfg.happyHourBonusPct / 100))
      : cfg.reward,
    exp: cfg.exp,
    cooldownSeconds: cfg.cooldownSeconds,
    nextClaimAt: remaining > 0 ? nextAtIso : null,
    secondsRemaining: remaining,
    claimsToday,
    dailyCap: cfg.dailyCap,
    happyHourActive: hh.active,
    happyHourBonusPct: cfg.happyHourBonusPct,
    happyHourAt: hh.nextAt,
    captchaRequired: cfg.requireCaptcha,
  };
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

  const cooldownRef = COOLDOWN_DOC(args.uid);
  const snap = await cooldownRef.get();
  const nextAtIso = snap.exists ? iso(snap.get('nextAt')) : null;
  const nextMs = nextAtIso ? Date.parse(nextAtIso) : 0;

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

  const result = await credit({
    uid: args.uid,
    source: 'faucet',
    amount: base,
    exp: cfg.exp,
    label: hh.active ? 'Faucet claim (happy hour)' : 'Faucet claim',
    refId: `w${window}`,
    idempotencyKey: `faucet_${window}`,
    ip: args.ip,
  });

  const nextAt = new Date(Date.now() + cfg.cooldownSeconds * 1000);
  await cooldownRef.set(
    { nextAt, lastClaimAt: now(), claims: int(snap.get('claims')) + 1, updatedAt: now() },
    { merge: true },
  );

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
