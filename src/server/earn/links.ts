import 'server-only';

import type { PtcAdItem, ShortlinkItem } from '@/lib/models';

import { assertCaptcha } from '../captcha';
import { getEconomy, getSiteConfig } from '../config';
import { AppError, bool, int, num, str } from '../db';
import {
  supabaseClaimCountsByRef,
  supabaseGetRow,
  supabaseListEnabled,
  supabaseUpdateRow,
} from '../data-supabase';
import { countToday, credit, type CreditResult } from '../ledger';
import { bumpStat } from '../stats';
import {
  assertItemUsable,
  assertNotCoolingDown,
  closeTaskSession,
  cooldownMap,
  openTaskSession,
  setCooldown,
  type TaskSession,
} from './tasks';

/* ============================================================================
   PTC ADS AND SHORTLINKS
   ----------------------------------------------------------------------------
   Both catalogues are Supabase tables you fill from Admin → Modules. Neither
   ships with inventory: a faucet's PTC list is its advertisers' copy and its
   shortlink list is its own affiliate links, and inventing either would put
   dead links in front of your users on day one.

     ptc_ads     title, description, tokens, seconds, cooldown_hours, type,
                 target_url, enabled, daily_cap, views_purchased,
                 views_delivered, last_viewed_at
     shortlinks  name, target_url, reward, seconds, cap, provider,
                 cooldown_hours, enabled

   The shortlink `target_url` is where your AdsLab or Adsterra direct link goes —
   that is the monetised hop, and `shortlink.directLink` in the ad placement map
   is the same URL expressed as ad inventory.
   ========================================================================== */

/* ---- PTC ----------------------------------------------------------------- */

function ptcFrom(id: string, data: Record<string, unknown>, availableAt: string | null, exp: number): PtcAdItem {
  return {
    id,
    title: str(data.title, 'Untitled campaign'),
    description: str(data.description),
    tokens: int(data.tokens, 0),
    exp: int(data.exp, exp),
    seconds: int(data.seconds, 15),
    cooldownHours: num(data.cooldownHours, 24),
    type: (str(data.type, 'Window') as PtcAdItem['type']),
    targetUrl: str(data.targetUrl),
    availableAt,
  };
}

export async function listPtcAds(uid: string | null): Promise<{
  ads: PtcAdItem[];
  totals: { available: number; reward: number; seconds: number; byType: Record<string, number> };
}> {
  const economy = await getEconomy();

  /* Rows come back with the Supabase snake_case columns; the camelCase keys
     the item mappers read are normalised here. */
  const list = await supabaseListEnabled('ptc_ads', 'tokens', 200);
  const rows = list.map((r) => ({
    id: String(r.id),
    data: {
      ...r,
      cooldownHours: r.cooldown_hours,
      targetUrl: r.target_url,
      viewsDelivered: r.views_delivered,
    },
  }));

  const ids = rows.map((r) => r.id);
  const cooldowns = uid ? await cooldownMap(uid, 'ptc', ids) : {};

  const ads = rows.map((r) =>
    ptcFrom(r.id, r.data, cooldowns[r.id] ?? null, economy.ptc.exp),
  );

  const available = ads.filter((a) => !a.availableAt);
  const byType: Record<string, number> = {};
  for (const ad of available) byType[ad.type] = (byType[ad.type] ?? 0) + 1;

  return {
    ads,
    totals: {
      available: available.length,
      reward: available.reduce((sum, a) => sum + a.tokens, 0),
      seconds: available.reduce((sum, a) => sum + a.seconds, 0),
      byType,
    },
  };
}

/** Load one catalogue row, normalising snake_case keys. */
async function loadItem(
  table: 'ptc_ads' | 'shortlinks',
  id: string,
): Promise<Record<string, unknown> | null> {
  const row = await supabaseGetRow(table, id);
  if (!row) return null;
  return {
    ...row,
    targetUrl: row.target_url,
    cooldownHours: row.cooldown_hours,
    viewsDelivered: row.views_delivered,
  };
}

export async function startPtcView(uid: string, adId: string): Promise<TaskSession & { targetUrl: string; title: string }> {
  const [economy, site] = await Promise.all([getEconomy(), getSiteConfig()]);
  if (!site.earningOpen) throw new AppError('Earning is paused right now.', 503, 'earning_paused');

  const data = await loadItem('ptc_ads', adId);
  assertItemUsable(data ? { enabled: bool(data.enabled, true), targetUrl: str(data.targetUrl) } : null, 'Campaign');

  await assertNotCoolingDown(uid, 'ptc', adId);

  const viewsToday = await countToday(uid, 'ptc');
  if (viewsToday >= economy.ptc.dailyCap) {
    throw new AppError(`Daily PTC limit reached (${economy.ptc.dailyCap}).`, 429, 'daily_cap');
  }

  const session = await openTaskSession({
    uid,
    kind: 'ptc',
    itemId: adId,
    requiredSeconds: int(data!.seconds, 15),
  });

  return { ...session, targetUrl: str(data!.targetUrl), title: str(data!.title, 'Campaign') };
}

export async function completePtcView(args: {
  uid: string;
  token: string;
  captchaToken?: string | null;
  ip: string | null;
}): Promise<CreditResult & { availableAt: string }> {
  const economy = await getEconomy();
  if (economy.ptc.requireCaptcha) await assertCaptcha(args.captchaToken, 'ptc', args.ip);

  const closed = await closeTaskSession({
    uid: args.uid,
    kind: 'ptc',
    token: args.token,
    graceSeconds: 2,
  });

  const data = await loadItem('ptc_ads', closed.itemId);
  if (!data) throw new AppError('That campaign was removed.', 404, 'not_found');

  const result = await credit({
    uid: args.uid,
    source: 'ptc',
    amount: int(data.tokens, 0),
    exp: int(data.exp, economy.ptc.exp),
    label: `PTC — ${str(data.title, 'campaign')}`,
    refId: closed.itemId,
    idempotencyKey: `ptc_${closed.itemId}_${Math.floor(Date.now() / 60000)}`,
    ip: args.ip,
  });

  const availableAt = await setCooldown(args.uid, 'ptc', closed.itemId, num(data.cooldownHours, 24));

  /* Advertiser accounting: one delivered view against the campaign's purchase.
     Read-then-write increment — PostgREST cannot express `views_delivered =
     views_delivered + 1` directly, and a missed counter tick is harmless. */
  await supabaseUpdateRow('ptc_ads', closed.itemId, {
    views_delivered: int(data.viewsDelivered) + 1,
    last_viewed_at: new Date().toISOString(),
  }).catch(() => {});
  await bumpStat({ ptcViews: 1 });

  return { ...result, availableAt };
}

/* ---- SHORTLINKS ---------------------------------------------------------- */

function shortlinkFrom(
  id: string,
  data: Record<string, unknown>,
  availableAt: string | null,
  used: number,
  exp: number,
): ShortlinkItem {
  return {
    id,
    name: str(data.name, 'Shortlink'),
    reward: int(data.reward, 0),
    exp: int(data.exp, exp),
    used,
    cap: int(data.cap, 1),
    seconds: int(data.seconds, 180),
    provider: data.provider ? str(data.provider) : null,
    targetUrl: str(data.targetUrl),
    availableAt,
  };
}

export async function listShortlinks(uid: string | null): Promise<{
  links: ShortlinkItem[];
  totals: { available: number; reward: number; exp: number; resetAt: string };
}> {
  const economy = await getEconomy();
  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);

  const list = await supabaseListEnabled('shortlinks', 'reward', 300);
  const rows = list.map((r) => ({
    id: String(r.id),
    data: {
      ...r,
      targetUrl: r.target_url,
      cooldownHours: r.cooldown_hours,
    },
  }));

  const ids = rows.map((r) => r.id);
  const [cooldowns, usage] = await Promise.all([
    uid ? cooldownMap(uid, 'shortlink', ids) : Promise.resolve({} as Record<string, string | null>),
    uid ? shortlinkUsageToday(uid) : Promise.resolve({} as Record<string, number>),
  ]);

  const links = rows.map((r) =>
    shortlinkFrom(
      r.id,
      r.data,
      cooldowns[r.id] ?? null,
      usage[r.id] ?? 0,
      economy.shortlinks.exp,
    ),
  );

  const available = links.filter((l) => !l.availableAt && l.used < l.cap);
  return {
    links,
    totals: {
      available: available.length,
      reward: available.reduce((sum, l) => sum + l.reward, 0),
      exp: available.reduce((sum, l) => sum + l.exp, 0),
      resetAt: midnight.toISOString(),
    },
  };
}

/** Per-link completions on the current UTC day, for the `used / cap` display. */
async function shortlinkUsageToday(uid: string): Promise<Record<string, number>> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  return supabaseClaimCountsByRef(uid, 'shortlink', startOfDay.toISOString());
}

export async function startShortlink(uid: string, linkId: string): Promise<TaskSession & { targetUrl: string; name: string }> {
  const [economy, site] = await Promise.all([getEconomy(), getSiteConfig()]);
  if (!site.earningOpen) throw new AppError('Earning is paused right now.', 503, 'earning_paused');

  const data = await loadItem('shortlinks', linkId);
  assertItemUsable(data ? { enabled: bool(data.enabled, true), targetUrl: str(data.targetUrl) } : null, 'Shortlink');

  await assertNotCoolingDown(uid, 'shortlink', linkId);

  const usage = await shortlinkUsageToday(uid);
  const cap = int(data!.cap, 1);
  if ((usage[linkId] ?? 0) >= cap) {
    throw new AppError(`You have used all ${cap} of today's claims on this link.`, 429, 'link_cap');
  }

  const claimsToday = await countToday(uid, 'shortlink');
  if (claimsToday >= economy.shortlinks.dailyCap) {
    throw new AppError(`Daily shortlink limit reached (${economy.shortlinks.dailyCap}).`, 429, 'daily_cap');
  }

  const session = await openTaskSession({
    uid,
    kind: 'shortlink',
    itemId: linkId,
    requiredSeconds: int(data!.seconds, 180),
    ttlSeconds: economy.shortlinks.tokenTtlSeconds,
  });

  return { ...session, targetUrl: str(data!.targetUrl), name: str(data!.name, 'Shortlink') };
}

export async function completeShortlink(args: {
  uid: string;
  token: string;
  captchaToken?: string | null;
  ip: string | null;
}): Promise<CreditResult & { availableAt: string }> {
  const economy = await getEconomy();
  if (economy.shortlinks.requireCaptcha) await assertCaptcha(args.captchaToken, 'shortlink', args.ip);

  const closed = await closeTaskSession({
    uid: args.uid,
    kind: 'shortlink',
    token: args.token,
    graceSeconds: 3,
  });

  const data = await loadItem('shortlinks', closed.itemId);
  if (!data) throw new AppError('That shortlink was removed.', 404, 'not_found');

  const result = await credit({
    uid: args.uid,
    source: 'shortlink',
    amount: int(data.reward, 0),
    exp: int(data.exp, economy.shortlinks.exp),
    label: `Shortlink — ${str(data.name, 'link')}`,
    refId: closed.itemId,
    idempotencyKey: `sl_${closed.itemId}_${Math.floor(Date.now() / 60000)}`,
    ip: args.ip,
  });

  /* Cooldown so the same link cannot be farmed back-to-back within its cap. */
  const gapHours = num(data.cooldownHours, 24 / Math.max(1, int(data.cap, 1)));
  const availableAt = await setCooldown(args.uid, 'shortlink', closed.itemId, gapHours);

  await bumpStat({ shortlinkClaims: 1 });
  return { ...result, availableAt };
}

/** Resolve a shortlink's monetised destination, for the countdown page. */
export async function getShortlinkTarget(linkId: string): Promise<{ name: string; targetUrl: string; seconds: number } | null> {
  const data = await loadItem('shortlinks', linkId);
  if (!data) return null;
  if (!bool(data.enabled, true)) return null;
  return {
    name: str(data.name, 'Shortlink'),
    targetUrl: str(data.targetUrl),
    seconds: int(data.seconds, 180),
  };
}
