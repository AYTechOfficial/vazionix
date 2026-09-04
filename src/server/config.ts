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

import { db, iso, isServerFirebaseReady } from './db';
import { isSupabaseBackend } from '@/lib/backend';
import { supabaseGetConfig, supabaseGetAdUnits } from './data-supabase';

/* ============================================================================
   CONFIGURATION READS
   ----------------------------------------------------------------------------
   Four documents drive the whole product:

     /config/economy   rewards, cooldowns, caps, tiers, levels
     /config/rates     usdPerToken, spot prices, payout rails
     /config/ads       master ad switches and exemptions
     /adUnits/{id}     one document per filled ad placement

   All four are optional. A missing document means "use the shipped defaults",
   which is what lets a brand-new Firebase project serve a working site before
   anyone opens the admin console.

   `cache()` is React's per-request memo. A page that reads the economy config in
   four different components issues one Firestore read, not four — and the value
   cannot change mid-render, so two components never disagree.
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
  /* Supabase: config documents live in the `config` table, keyed by the path
     (e.g. 'economy'). Fetch the JSON value directly. */
  if (isSupabaseBackend) {
    try {
      return await supabaseGetConfig(path);
    } catch (error) {
      console.error(`[config] supabase read failed for ${path}`, error);
      return null;
    }
  }

  if (!isServerFirebaseReady()) return null;
  try {
    const snap = await db().doc(path).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
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
 * One read of the whole /adUnits collection rather than one per placement: a
 * dense page mounts a dozen slots, and twelve document reads per navigation is
 * the single largest avoidable line on a Firestore bill at faucet traffic.
 */
export const getAdConfig = cache(async (): Promise<AdRuntimeConfig> => {
  const behaviourDoc = await readDoc('config/ads');
  const behaviour: AdBehaviourConfig = merge(DEFAULT_AD_BEHAVIOUR, behaviourDoc);

  const units: Record<string, AdUnitConfig> = {};

  if (isSupabaseBackend) {
    try {
      const rows = await supabaseGetAdUnits();
      for (const row of rows) {
        const placement = String(row.placement_id ?? '');
        if (!placement) continue;
        units[placement] = {
          placement: placement as PlacementId,
          kind: (row.kind as AdUnitConfig['kind']) ?? 'html',
          enabled: row.enabled !== false,
          ...(row.html ? { html: String(row.html) } : {}),
          ...(row.src ? { src: String(row.src) } : {}),
          ...(row.network ? { network: String(row.network) } : {}),
          ...(row.cap_per_session ? { capPerSession: Number(row.cap_per_session) } : {}),
        };
      }
    } catch (error) {
      console.error('[config] supabase adUnits read failed', error);
    }
  } else if (isServerFirebaseReady()) {
    try {
      const snap = await db().collection('adUnits').get();
      for (const doc of snap.docs) {
        const data = doc.data() as Partial<AdUnitConfig>;
        units[doc.id] = {
          placement: doc.id as PlacementId,
          kind: data.kind ?? 'html',
          enabled: data.enabled !== false,
          ...(data.format ? { format: data.format } : {}),
          ...(data.html ? { html: data.html } : {}),
          ...(data.src ? { src: data.src } : {}),
          ...(data.containerId ? { containerId: data.containerId } : {}),
          ...(data.url ? { url: data.url } : {}),
          ...(data.network ? { network: data.network } : {}),
          ...(data.capPerSession ? { capPerSession: data.capPerSession } : {}),
          ...(data.geo ? { geo: data.geo } : {}),
        };
      }
    } catch (error) {
      console.error('[config] adUnits read failed', error);
    }
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
