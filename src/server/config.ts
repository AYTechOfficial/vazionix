import 'server-only';

import { cache } from 'react';

import {
  DEFAULT_ECONOMY,
  DEFAULT_RAILS,
  DEFAULT_SPOT,
  type EconomyConfig,
  type RailDefault,
} from '@/lib/config/economy';
import type { CoinTicker, PayoutRail } from '@/lib/models';
import { DEFAULT_AD_BEHAVIOUR, type AdBehaviourConfig, type AdUnitConfig } from '@/lib/ads/config';
import type { PlacementId } from '@/lib/ads/placements';

import { iso } from './db';
import { supabaseGetConfig, supabaseGetAdUnits } from './data-supabase';

/* ============================================================================
   CONFIGURATION READS
   ----------------------------------------------------------------------------
   Four sections drive the whole product, all stored in the `config` table as
   JSON values keyed by their section name:

     economy   rewards, cooldowns, caps, tiers, levels
     rates     usdPerToken, spot prices, payout rails
     ads       master ad switches and exemptions
     site      maintenance and feature flags

   plus one row per filled ad placement in the `ad_units` table.

   All of them are optional. A missing row means "use the shipped defaults",
   which is what lets a brand-new Supabase project serve a working site before
   anyone opens the admin console.

   `cache()` is React's per-request memo. A page that reads the economy config
   in four different components issues one database read, not four — and the
   value cannot change mid-render, so two components never disagree.
   ========================================================================== */

/** Deep merge that only overrides keys actually present in `patch`. */
function merge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    const current = out[key];
    if (
      current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      out[key] = merge(current, value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  /* Config documents live in the `config` table, keyed by the section after the
     'config/' prefix (e.g. 'config/economy' -> 'economy'). The value is the JSON
     the admin console deep-merges its patches into. */
  const section = path.replace(/^config\//, '');
  try {
    return await supabaseGetConfig(section);
  } catch (error) {
    // A config read must never take a page down. Log and fall back to defaults;
    // the site runs on shipped values instead of 500ing.
    console.error(`[config] read failed for ${path}`, error);
    return null;
  }
}

export const getEconomy = cache(async (): Promise<EconomyConfig> => {
  const remote = await readDoc('config/economy');
  return merge(DEFAULT_ECONOMY, remote);
});

export interface RatesConfig {
  usdPerToken: number;
  spot: Record<CoinTicker, number>;
  rails: RailDefault[];
  updatedAt: string | null;
}

export const getRates = cache(async (): Promise<RatesConfig> => {
  const remote = await readDoc('config/rates');
  const economy = await getEconomy();

  const spot = merge(DEFAULT_SPOT, remote?.spot);
  const rails = Array.isArray(remote?.rails) && remote!.rails.length
    ? (remote!.rails as RailDefault[])
    : DEFAULT_RAILS;

  return {
    usdPerToken: Number(remote?.usdPerToken ?? economy.usdPerToken) || economy.usdPerToken,
    spot,
    rails,
    updatedAt: iso(remote?.updatedAt),
  };
});

/** Rails as the withdraw UI consumes them: enabled only, stable order. */
export async function getPayoutRails(): Promise<PayoutRail[]> {
  const { rails } = await getRates();
  return rails
    .filter((r) => r.enabled !== false)
    .map((r) => ({
      coin: r.coin,
      rail: r.rail,
      network: r.network,
      min: r.min,
      fee: r.fee,
      etaLabel: r.etaLabel,
      enabled: r.enabled !== false,
    }));
}

/* ---- ADS ------------------------------------------------------------------ */

export interface AdRuntimeConfig {
  behaviour: AdBehaviourConfig;
  units: Record<string, AdUnitConfig>;
}

/**
 * The ad map, read once per request and handed to `AdProvider`.
 *
 * One read of the whole `ad_units` table rather than one per placement: a dense
 * page mounts a dozen slots, and a dozen round-trips per navigation is the
 * single largest avoidable latency cost at faucet traffic.
 *
 * Each row keeps its scalar fields in dedicated columns (kind, src, html,
 * network, cap_per_session, enabled) and parks the rest of the editor payload
 * (format, containerId, url, geo) in a `json` text column — written by
 * saveAdUnit as a JSON.stringify'd object, parsed back here.
 */
export const getAdConfig = cache(async (): Promise<AdRuntimeConfig> => {
  const behaviourDoc = await readDoc('config/ads');
  const behaviour: AdBehaviourConfig = merge(DEFAULT_AD_BEHAVIOUR, behaviourDoc);

  const units: Record<string, AdUnitConfig> = {};

  try {
    const rows = await supabaseGetAdUnits();
    for (const row of rows) {
      const placement = String(row.placement_id ?? '');
      if (!placement) continue;

      /* The editor's extra fields ride in the json text column; anything it
         fails to parse is treated as absent rather than failing the whole map. */
      let extras: Record<string, unknown> = {};
      try {
        const raw = row.json ? String(row.json) : '';
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          extras = parsed as Record<string, unknown>;
        }
      } catch {
        console.error(`[config] ad_units json parse failed for ${placement}`);
      }

      units[placement] = {
        placement: placement as PlacementId,
        kind: (row.kind as AdUnitConfig['kind']) ?? 'html',
        enabled: row.enabled !== false,
        ...(row.html ? { html: String(row.html) } : {}),
        ...(row.src ? { src: String(row.src) } : {}),
        ...(row.network ? { network: String(row.network) } : {}),
        ...(row.cap_per_session ? { capPerSession: Number(row.cap_per_session) } : {}),
        ...(extras.format ? { format: extras.format as AdUnitConfig['format'] } : {}),
        ...(extras.containerId ? { containerId: String(extras.containerId) } : {}),
        ...(extras.url ? { url: String(extras.url) } : {}),
        ...(Array.isArray(extras.geo) ? { geo: extras.geo as string[] } : {}),
      };
    }
  } catch (error) {
    console.error('[config] adUnits read failed', error);
  }

  return { behaviour, units };
});

/* ---- SITE / FEATURE FLAGS ------------------------------------------------- */

export interface SiteConfig {
  maintenance: boolean;
  maintenanceMessage: string;
  signupsOpen: boolean;
  withdrawalsOpen: boolean;
  earningOpen: boolean;
  announcement: string | null;
  announcementTone: 'info' | 'warning' | 'success';
}

export const DEFAULT_SITE: SiteConfig = {
  maintenance: false,
  maintenanceMessage: 'We are performing scheduled maintenance. Earning resumes shortly.',
  signupsOpen: true,
  withdrawalsOpen: true,
  earningOpen: true,
  announcement: null,
  announcementTone: 'info',
};

export const getSiteConfig = cache(async (): Promise<SiteConfig> => {
  const remote = await readDoc('config/site');
  return merge(DEFAULT_SITE, remote);
});
